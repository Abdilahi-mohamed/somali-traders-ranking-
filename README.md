# SomaliTraders Rank

The project is split into independent application folders:

- `frontend/` — React, TypeScript, and Vite leaderboard, trader portal, and admin console.
- `backend/` — Express, TypeScript, MongoDB, and MetaApi read-only account synchronization.

## Run locally

Open two terminals from the project directory.

```powershell
cd backend
Copy-Item .env.example .env
# Configure MongoDB and a private session-signing secret; optionally configure MetaApi below.
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`. Vite proxies `/api` requests to the backend at `http://localhost:4000`. The backend requires Node.js 22 or newer.

Set `MONGODB_URI` and `MONGODB_DATABASE` in `backend/.env`. For a local MongoDB server, the example URI works as-is; for MongoDB Atlas, use the cluster connection string and allow the backend host in the Atlas network access list. The backend creates its collections and indexes on startup. Keep the MongoDB URI, `AUTH_TOKEN_SECRET`, and MetaApi token private and backend-only; never expose or commit them.

Generate a unique signing secret for each environment:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set the output as `AUTH_TOKEN_SECRET`. Trader passwords are stored as salted scrypt hashes, and API sessions are HMAC-signed and expire after seven days. Configure `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` together on the first startup to provision an administrator; use a strong password of at least 12 characters. These values only create the admin if that username does not already exist. There is no default admin account.

Supabase is no longer used for storage or authentication. New registrations are immediately able to sign in; email confirmation and password-reset emails are not provided by this application.

**Existing Supabase data is not automatically copied.** Keep your old Supabase project until any required data has been exported and migrated. Because Supabase password hashes cannot be reused by this MongoDB authentication system, existing traders must register new credentials; historical profiles, account records, trading history, and admin accounts need a separately planned migration before switching a production deployment.

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

The backend accepts ranking eligibility only after MetaApi account information independently confirms a `REAL` trade mode, investor-only access, the registered login/server/platform, and an account-holder name matching the trader's registered full name. `DEMO` and `CONTEST` accounts are rejected; missing or unsupported provider data remains Pending Verification and is never inferred from a trader selection, balance, or user-supplied account type. Non-Real accounts are never included in a leaderboard or ranking score. Verification decisions are recorded in `trading_account_verification_audit`; status is rechecked every 15 minutes, and leaderboard eligibility expires if a successful verification is older than 30 minutes. Failed rechecks immediately suspend eligibility. Open positions are synchronized and exposed only to the authenticated account owner.

Account history and performance snapshots are synchronized by a 15-minute in-process timer. Run only one backend instance with this scheduler until it is moved to a distributed job queue. Maximum drawdown is calculated from captured account-equity snapshots and therefore reflects observed synchronization samples, not every intraperiod equity movement. ROI is measured from the first successful connection snapshot. No live MetaApi account has been used to validate deployment in this repository; configure a test MetaApi account and verify broker compatibility before production.

### Provision a Super Admin

Set `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `backend/.env` before the first backend startup. Open `/admin/login` and sign in with those credentials. The server verifies the signed session and MongoDB admin record for every protected admin API request.

## Routes

- `/` — Provider-backed Verified Real leaderboard (Live/Real accounts only).
- `/register` — Multi-step trader registration; MetaApi connection is optional.
- `/dashboard` — Authenticated trader account settings, refresh, credential replacement, and disconnection.
- `/admin/login` — Super Admin username/password sign-in.
- `/admin` — Administrator-only database overview.

Trader account and history endpoints require a valid signed bearer token and scope every account lookup to the authenticated trader. Registration remains available without MetaApi configuration or an investor password. Duplicate MT4/MT5 account registrations are rejected. The application does not implement trading, deposits, or withdrawals. Missing metrics remain unavailable rather than being fabricated. Account status, trading history, positions, snapshots, verification audits, trader profiles, and administrators are stored in MongoDB.

## Build

Run `npm run build` in both `backend/` and `frontend/`.
