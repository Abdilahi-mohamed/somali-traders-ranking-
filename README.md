# SomaliTraders Rank

The project is split into independent application folders:

- `frontend/` — React, TypeScript, and Vite leaderboard, trader portal, and admin console.
- `backend/` — Express, TypeScript, and Supabase API with MetaApi read-only account synchronization.

## Run locally

Open two terminals from the project directory.

```powershell
cd backend
Copy-Item .env.example .env
# Set Supabase values; optionally set MetaApi values below.
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`. Vite proxies `/api` requests to the backend at `http://localhost:4000`. The backend requires Node.js 22 or newer.

Create a Supabase project, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`, then run every SQL migration in `backend/supabase/migrations/` in filename order. Keep `.env` local; service-role and MetaApi tokens must remain backend-only and must never be exposed to Vite or committed.

### Configure MetaApi

The application uses MetaApi's supported Provisioning and MetaApi REST APIs from the backend. The trader submits only an MT4/MT5 investor password; the service token is never requested from traders or sent to the frontend.

Set these backend environment variables to enable account connections:

```dotenv
METAAPI_TOKEN=your-server-side-metaapi-token
METAAPI_BASE_URL=https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
METAAPI_REGION=new-york
```

Create a MetaApi account and obtain an API token with permission to provision and manage the application-owned accounts. MetaApi is a paid service. Account creation depends on broker/server compatibility, valid investor-password support, MetaApi resource limits, and sufficient subscription/resource slots. Some brokers require a provisioning profile configured in MetaApi. Confirm supported server names and account behavior with MetaApi before launch.

Investor passwords are not stored in this application's database; they are sent server-to-server to MetaApi, which must retain the account credential to keep its connection running. Review MetaApi's current credential storage, access controls, retention, and deletion policies for your subscription before enabling production connections. Removing an account through the trader dashboard requests provider-side account removal; if MetaApi is not configured, remote removal cannot be confirmed and the application reports an error instead of claiming disconnection.

The connection is accepted as read-only only when MetaApi's account information confirms `investorMode`. The account type is taken from the platform's `tradeMode` information, and Verified Real/Demo ranking eligibility additionally requires the provider account name to match the trader's registered full name. Missing or unsupported mode or owner information remains Pending Verification; it is never inferred from balance or user-supplied data. Only provider-confirmed REAL accounts enter the official leaderboard; DEMO accounts use the separate demo leaderboard, and CONTEST/unverified accounts are excluded. Open positions are synchronized and exposed only to the authenticated account owner.

Account history and performance snapshots are synchronized by a 15-minute in-process timer. Run only one backend instance with this scheduler until it is moved to a distributed job queue. Maximum drawdown is calculated from captured account-equity snapshots and therefore reflects observed synchronization samples, not every intraperiod equity movement. ROI is measured from the first successful connection snapshot. No live MetaApi account has been used to validate deployment in this repository; configure a test MetaApi account and verify broker compatibility before production.

### Provision a Super Admin

1. In Supabase Dashboard, create the administrator in **Authentication → Users** and set a strong password. Do not use the public trader registration flow for admin accounts.
2. In the SQL Editor, associate that Auth user with a unique, lowercase username:

   ```sql
   insert into public.admin_users (user_id, username, email)
   select id, lower('YOUR_USERNAME'), lower(email)
   from auth.users
   where lower(email) = lower('YOUR_SUPABASE_AUTH_EMAIL');
   ```

3. Open `/admin/login` and sign in with that username and the password set in Supabase. The server verifies administrator membership for every protected admin API request. No default credentials are created.

## Routes

- `/` — Provider-backed Verified Real leaderboard and separate Demo leaderboard.
- `/register` — Multi-step trader registration; MetaApi connection is optional.
- `/dashboard` — Authenticated trader account settings, refresh, credential replacement, and disconnection.
- `/admin/login` — Super Admin username/password sign-in.
- `/admin` — Administrator-only database overview.

Trader account and history endpoints require a valid Supabase Auth bearer token and scope every account lookup to the authenticated trader. Registration remains available without MetaApi configuration or an investor password. Duplicate MT4/MT5 account registrations are rejected. The application does not implement trading, deposits, or withdrawals. Missing metrics remain unavailable rather than being fabricated.

Configure Supabase Auth email confirmation before launch. Account status, historical snapshots, and eligibility use the migrations under `backend/supabase/migrations/`.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
