# SomaliTraders Rank

The project is split into independent application folders:

- `frontend/` — React, TypeScript, and Vite public leaderboard, trader portal, and admin console.
- `backend/` — Express and TypeScript demo API with sample trader, account, and overview data.

## Run locally

Open two terminals from the project directory.

```powershell
cd backend
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`. Vite proxies `/api` requests to the backend at `http://localhost:4000`.

## Routes

- `/` — Public performance leaderboard
- `/dashboard` — Trader overview and connected account sample
- `/admin` — Administrative moderation overview

The API currently serves illustrative data only: `GET /api/health`, `GET /api/leaderboard`, `GET /api/trader/overview`, and `GET /api/admin/overview`. No broker credentials, authentication, or account actions are implemented. Add production-grade authentication, authorization, persistence, audit logging, and broker integrations before using this as a real trading service.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
