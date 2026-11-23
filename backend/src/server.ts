import cors from "cors";
import express from "express";
import { adminAccounts, traders, traderOverview } from "./data.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", mode: "demo" });
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

app.listen(port, () => {
  console.log(`Somali Traders demo API listening on http://localhost:${port}`);
});
