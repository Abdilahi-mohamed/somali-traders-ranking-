import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { getAdminFromAccessToken, InvalidAdminCredentialsError, loginAdmin, adminLoginSchema } from "./adminAuth.js";
import { config } from "./config.js";
import { adminAccounts, traders, traderOverview } from "./data.js";
import { DuplicateEmailError, registerTrader, registrationSchema } from "./registration.js";
import { SupabaseConfigurationError } from "./supabase.js";

const app = express();
const adminCookieName = "st_admin_session";
const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/"
};

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  }
});

function requireAdmin(request: express.Request, response: express.Response, next: express.NextFunction) {
  const accessToken = request.cookies[adminCookieName];
  if (!accessToken) {
    response.status(401).json({ error: "Administrator sign-in is required." });
    return;
  }

  void getAdminFromAccessToken(accessToken).then((user) => {
    if (!user) {
      response.status(401).json({ error: "Administrator sign-in is required." });
      return;
    }
    response.locals.adminUser = user;
    next();
  }).catch(next);
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", mode: "demo" });
});

app.post("/api/register", registrationLimiter, (request, response, next) => {
  const parsed = registrationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Please check the registration details.", issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) });
    return;
  }

  void registerTrader(parsed.data).then((result) => {
    response.status(201).json(result);
  }).catch((error: unknown) => {
    if (error instanceof DuplicateEmailError) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof SupabaseConfigurationError) {
      response.status(503).json({ error: error.message });
      return;
    }
    next(error);
  });
});

app.get("/api/leaderboard", (_request, response) => {
  response.json({ traders, total: 142, verifiedOnline: 8 });
});

app.post("/api/admin/login", adminLoginLimiter, (request, response, next) => {
  const parsed = adminLoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid username and password." });
    return;
  }

  void loginAdmin(parsed.data.username, parsed.data.password).then(({ accessToken, expiresIn, user }) => {
    response.cookie(adminCookieName, accessToken, { ...adminCookieOptions, maxAge: expiresIn * 1000 });
    response.json({ user });
  }).catch((error: unknown) => {
    if (error instanceof InvalidAdminCredentialsError) {
      response.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof SupabaseConfigurationError) {
      response.status(503).json({ error: error.message });
      return;
    }
    next(error);
  });
});

app.get("/api/admin/session", requireAdmin, (_request, response) => {
  response.json({ user: response.locals.adminUser });
});

app.post("/api/admin/logout", (_request, response) => {
  response.clearCookie(adminCookieName, adminCookieOptions);
  response.status(204).end();
});

app.get("/api/admin/overview", requireAdmin, (_request, response) => {
  response.json({
    registeredTraders: 186,
    verifiedTraders: 172,
    pendingVerifications: 9,
    flaggedAccounts: 3,
    workerUptime: 99.8,
    accounts: adminAccounts
  });
});

app.get("/api/trader/overview", (_request, response) => {
  response.json(traderOverview);
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("API request failed", error);
  if (error instanceof SupabaseConfigurationError) {
    response.status(503).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(config.port, () => {
  console.log(`Somali Traders API listening on http://localhost:${config.port}`);
});
