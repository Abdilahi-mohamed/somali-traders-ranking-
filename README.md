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
The backend requires Node.js 22 or newer. Create a Supabase project, set the three Supabase values in `backend/.env`, then run both SQL migrations in `backend/supabase/migrations/` in filename order. Keep `.env` local; the service role key must stay on the backend and must never be exposed to Vite or committed.

### Provision a Super Admin

1. In Supabase Dashboard, create the administrator in **Authentication → Users** and set a strong password. Do not use the public trader registration flow for admin accounts.
2. In the SQL Editor, associate that Auth user with a unique, lowercase username:

   ```sql
   insert into public.admin_users (user_id, username, email)
   select id, lower('YOUR_USERNAME'), lower(email)
   from auth.users
   where lower(email) = lower('YOUR_SUPABASE_AUTH_EMAIL');
   ```

3. Open `/admin/login` and sign in with that username and the password set in Supabase. Successful sign-in redirects to `/admin`; the server also verifies administrator membership for every admin API request. No default credentials are created.

## Routes

- `/` — Public performance leaderboard, shown first
- `/register` — Multi-step registration and account setup
- `/dashboard` — Trader overview and connected account sample
- `/admin/login` — Super Admin username/password sign-in
- `/admin` — Administrator-only moderation overview

The API supports registration and admin authentication: `GET /api/health`, `GET /api/leaderboard`, `GET /api/trader/overview`, `POST /api/register`, and the protected `/api/admin/*` routes. Supabase Auth manages website passwords; admin access uses a short-lived HttpOnly cookie and a private `admin_users` allowlist. Trader registration stores non-secret MT4/MT5 account metadata, including currency, in RLS-protected Supabase tables. Account type and connection status are not user-selected; new accounts remain pending verification. Duplicate MT4/MT5 account registrations are rejected.

The Investor Password field is intentionally disabled: no licensed MT4/MT5 read-only provider, protected credential store/key management, verification service, or synchronization worker is configured. The backend rejects unknown registration fields, so it will not accept an investor password. Do not send an investor or master password until a supported provider is selected, security-reviewed, and configured. No account data is fabricated; the public ranking and trader dashboard show no connected or Verified Real accounts, and ranking/award eligibility requires provider-confirmed REAL account mode. Demo and contest accounts must remain excluded from the official Real Traders Ranking.

Apply the migrations in filename order, including `backend/supabase/migrations/202611240001_metatrader_registration.sql`, to add account currency, verification state, and duplicate account protection. A provider integration, encrypted credential lifecycle, ownership/account-type verification, scheduled snapshots, and authenticated refresh/disconnect endpoints remain required before account connection can be enabled. Configure Supabase Auth email confirmation before launch. The admin overview is still illustrative and is not an authoritative source of account verification.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
