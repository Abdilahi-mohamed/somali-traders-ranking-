import rateLimit from "express-rate-limit";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { adminAccounts, traders, traderOverview } from "./data.js";
import { DuplicateEmailError, registerTrader, registrationSchema } from "./registration.js";

const app = express();

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: "16kb" }));

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

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
    next(error);
  });
});

app.get("/api/leaderboard", (_request, response) => {
  response.json({ traders, total: 142, verifiedOnline: 8 });
});

app.get("/api/admin/overview", (_request, response) => {
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
  response.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(config.port, () => {
  console.log(`Somali Traders API listening on http://localhost:${config.port}`);
});
