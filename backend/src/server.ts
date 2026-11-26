import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { getAdminFromAccessToken, InvalidAdminCredentialsError, loginAdmin, adminLoginSchema, provisionInitialAdmin } from "./adminAuth.js";
import { getAdminOverview } from "./adminOverview.js";
import { AuthConfigurationError, validateAuthConfiguration } from "./authTokens.js";
import { config, isMetaApiConfigured } from "./config.js";
import { listLeaderboard } from "./leaderboard.js";
import { DuplicateEmailError, DuplicateTradingAccountError, registerTrader, registrationSchema } from "./registration.js";
import { closeMongo, getMongoCollections, MongoConfigurationError } from "./mongo.js";
import { getTraderFromAccessToken, InvalidTraderCredentialsError, loginTrader, traderLoginSchema } from "./traderAuth.js";
import { connectOwnedTradingAccount, disconnectOwnedTradingAccount, listOwnedTradingAccounts, listOwnedTradingOpenPositions, metaApiIntegrationStatus, parseConnectionInput, refreshOwnedTradingAccount, synchronizeConnectedAccounts } from "./tradingAccounts.js";

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

const traderLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const traderAccountRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const traderAccountDisconnectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
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

function requireTrader(request: express.Request, response: express.Response, next: express.NextFunction) {
  const authorization = request.header("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    response.status(401).json({ error: "Trader sign-in is required." });
    return;
  }

  void getTraderFromAccessToken(accessToken).then((user) => {
    if (!user) {
      response.status(401).json({ error: "Trader sign-in is required." });
      return;
    }
    response.locals.traderUser = user;
    next();
  }).catch(next);
}

function getAccountId(request: express.Request) {
  const accountId = request.params.accountId;
  return Array.isArray(accountId) ? accountId[0] ?? null : accountId;
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", mode: "verified_real_accounts_only" });
});

app.get("/api/metaapi/status", (_request, response) => {
  const status = metaApiIntegrationStatus();
  response.json({
    ...status,
    message: status.configured
      ? "MetaApi credentials are configured. Account connectivity depends on broker support and valid investor access."
      : "Trading account integration is currently unavailable. You can complete registration and connect your account later."
  });
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
    if (error instanceof DuplicateTradingAccountError) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof MongoConfigurationError || error instanceof AuthConfigurationError) {
      response.status(503).json({ error: error.message });
      return;
    }
    next(error);
  });
});

app.get("/api/leaderboard", (_request, response, next) => {
  void listLeaderboard().then((traders) => response.json({ traders, total: traders.length })).catch(next);
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
    if (error instanceof MongoConfigurationError || error instanceof AuthConfigurationError) {
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

app.get("/api/admin/overview", requireAdmin, (_request, response, next) => {
  void getAdminOverview().then((overview) => response.json(overview)).catch(next);
});

app.post("/api/trader/login", traderLoginLimiter, (request, response, next) => {
  const parsed = traderLoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email address and password." });
    return;
  }
  void loginTrader(parsed.data.email, parsed.data.password).then((session) => {
    response.json(session);
  }).catch((error: unknown) => {
    if (error instanceof InvalidTraderCredentialsError) {
      response.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof MongoConfigurationError || error instanceof AuthConfigurationError) {
      response.status(503).json({ error: error.message });
      return;
    }
    next(error);
  });
});

app.get("/api/trader/accounts", requireTrader, (request, response, next) => {
  void listOwnedTradingAccounts(response.locals.traderUser.user_id).then((accounts) => {
    response.json({ accounts });
  }).catch(next);
});

app.get("/api/trader/accounts/:accountId/positions", requireTrader, (request, response, next) => {
  const accountId = getAccountId(request);
  if (!accountId) {
    response.status(400).json({ error: "Invalid trading account ID." });
    return;
  }
  void listOwnedTradingOpenPositions(response.locals.traderUser.user_id, accountId).then((positions) => {
    if (!positions) {
      response.status(404).json({ error: "Trading account not found." });
      return;
    }
    response.json({ positions });
  }).catch(next);
});

app.post("/api/trader/accounts/:accountId/connect", requireTrader, rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
}), (request, response, next) => {
  if (!parseConnectionInput(request.body).success) {
    response.status(400).json({ error: "Enter an investor password to connect this account." });
    return;
  }
  const accountId = getAccountId(request);
  if (!accountId) {
    response.status(400).json({ error: "Invalid trading account ID." });
    return;
  }
  void connectOwnedTradingAccount(response.locals.traderUser.user_id, accountId, request.body)
    .then((result) => response.status(result.statusCode).json(result.ok ? { status: result.status } : { error: result.error }))
    .catch(next);
});

app.post("/api/trader/accounts/:accountId/refresh", requireTrader, traderAccountRefreshLimiter, (request, response, next) => {
  const accountId = getAccountId(request);
  if (!accountId) {
    response.status(400).json({ error: "Invalid trading account ID." });
    return;
  }
  void refreshOwnedTradingAccount(response.locals.traderUser.user_id, accountId)
    .then((result) => response.status(result.statusCode).json(result.ok ? { status: result.status } : { error: result.error }))
    .catch(next);
});

app.post("/api/trader/accounts/:accountId/disconnect", requireTrader, traderAccountDisconnectLimiter, (request, response, next) => {
  const accountId = getAccountId(request);
  if (!accountId) {
    response.status(400).json({ error: "Invalid trading account ID." });
    return;
  }
  void disconnectOwnedTradingAccount(response.locals.traderUser.user_id, accountId)
    .then((result) => response.status(result.statusCode).json(result.ok ? { status: result.status } : { error: result.error }))
    .catch(next);
});

app.get("/api/trader/overview", requireTrader, (request, response, next) => {
  void listOwnedTradingAccounts(response.locals.traderUser.user_id).then((accounts) => {
    response.json({
      name: response.locals.traderUser.trading_alias,
      status: isMetaApiConfigured() ? "available" : "integration_not_configured",
      accounts
    });
  }).catch(next);
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("API request failed.", { errorType: error instanceof Error ? error.name : "UnknownError" });
  if (error instanceof MongoConfigurationError || error instanceof AuthConfigurationError) {
    response.status(503).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "An unexpected server error occurred." });
});

async function startServer() {
  validateAuthConfiguration();
  await getMongoCollections();
  await provisionInitialAdmin();
  app.listen(config.port, () => {
    console.log(`Somali Traders API listening on http://localhost:${config.port}`);
  });
}

void startServer().catch(async (error: unknown) => {
  console.error("Could not start the API server.", { errorType: error instanceof Error ? error.name : "UnknownError" });
  try {
    await closeMongo();
  } catch (closeError) {
    console.error("Could not close MongoDB after server startup failed.", {
      errorType: closeError instanceof Error ? closeError.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});

const synchronizationTimer = setInterval(() => {
  void synchronizeConnectedAccounts().catch(() => {
    console.error("Scheduled MetaApi synchronization could not run.");
  });
}, 15 * 60 * 1000);
synchronizationTimer.unref();
