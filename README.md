# SomaliTraders Rank

The project is split into independent application folders:

- `frontend/` — React, TypeScript, and Vite public leaderboard, trader portal, and admin console.
- `backend/` — Express and TypeScript demo API with sample trader, account, and overview data.

## Run locally

Open two terminals from the project directory.

```powershell
cd backend
Copy-Item .env.example .env
# Fill SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`. Vite proxies `/api` requests to the backend at `http://localhost:4000`.
The backend requires Node.js 22 or newer. Create a Supabase project, set the three Supabase values in `backend/.env`, then run `backend/supabase/migrations/202611230001_registration.sql` in the Supabase SQL Editor. Keep `.env` local; the service role key must stay on the backend and must never be exposed to Vite or committed.

## Routes

- `/` — Public performance leaderboard, shown first
- `/register` — Multi-step registration and account setup
- `/dashboard` — Trader overview and connected account sample
- `/admin` — Administrative moderation overview

The API serves illustrative leaderboard/admin data and supports registration: `GET /api/health`, `GET /api/leaderboard`, `GET /api/trader/overview`, `GET /api/admin/overview`, and `POST /api/register`. Supabase Auth manages website passwords; the backend stores profile and non-secret account metadata in RLS-protected Supabase tables. Broker investor passwords, exchange API keys/secrets, and identity documents are not accepted. Configure Supabase Auth email confirmation before launch. The public leaderboard still uses sample data; authenticated login, live broker connections, and production privacy/compliance workflows remain to be implemented.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
