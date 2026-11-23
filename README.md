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

The API serves illustrative leaderboard/admin data and supports registration and admin authentication: `GET /api/health`, `GET /api/leaderboard`, `GET /api/trader/overview`, `POST /api/register`, and the protected `/api/admin/*` routes. Supabase Auth manages passwords; admin access uses a short-lived HttpOnly cookie and a private `admin_users` allowlist. The backend stores profile and non-secret account metadata in RLS-protected Supabase tables. Broker investor passwords, exchange API keys/secrets, and identity documents are not accepted. Configure Supabase Auth email confirmation before launch. The public leaderboard and admin overview still use sample data; live broker connections and production privacy/compliance workflows remain to be implemented.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
