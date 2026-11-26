import { isMetaApiConfigured } from "./config.js";
import { getMongoCollections } from "./mongo.js";

const pendingStatuses = ["not_connected", "connecting", "connected", "pending_verification", "integration_not_configured"];

function accountStatus(connectionStatus: string) {
  switch (connectionStatus) {
    case "not_connected": return "Not Connected";
    case "connecting": return "Connecting";
    case "connected": return "Connected";
    case "verified_real": return "Verified Real";
    case "demo_account": return "Demo Account — Rejected";
    case "contest_account": return "Contest Account — Rejected";
    case "pending_verification": return "Pending Verification";
    case "connection_failed": return "Connection Failed";
    case "integration_not_configured": return "Integration Not Configured";
    case "disconnected": return "Disconnected";
    default: return "Pending Verification";
  }
}

export async function getAdminOverview() {
  const collections = await getMongoCollections();
  const [registeredTraders, rows] = await Promise.all([
    collections.trader_profiles.countDocuments(),
    collections.trading_accounts.find().toArray()
  ]);
  const traderIds = [...new Set(rows.map((account) => account.trader_id))];
  const profiles = traderIds.length
    ? await collections.trader_profiles.find({ user_id: { $in: traderIds } })
      .project({ user_id: 1, full_name: 1, trading_alias: 1, email: 1, region: 1 })
      .toArray()
    : [];
  const profilesById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const freshnessLimit = Date.now() - 30 * 60 * 1000;
  const verifiedTraders = new Set(rows.filter((account) =>
    account.account_type === "forex" &&
    account.connection_status === "verified_real" &&
    account.verified_account_type === "REAL" &&
    account.ownership_verified === true &&
    Boolean(account.metaapi_account_id) &&
    account.last_successful_sync_at != null &&
    new Date(account.last_successful_sync_at).getTime() >= freshnessLimit
  ).map((account) => account.trader_id)).size;
  const pendingVerifications = rows.filter((account) => pendingStatuses.includes(account.connection_status)).length;
  const flaggedAccounts = rows.filter((account) => account.connection_status === "connection_failed").length;

  return {
    registeredTraders,
    verifiedTraders,
    pendingVerifications,
    flaggedAccounts,
    synchronizationEnabled: isMetaApiConfigured(),
    accounts: rows.map((account) => {
      const profile = profilesById.get(account.trader_id);
      return {
        name: profile?.trading_alias || profile?.full_name || "Trader",
        city: profile?.region ?? "—",
        email: profile?.email ?? "—",
        broker: [account.broker_name, account.server_name].filter(Boolean).join(" · ") || account.platform || "—",
        id: account.account_number ? `••••${account.account_number.slice(-4)}` : account.id,
        type: account.verified_account_type ?? (account.account_type === "forex" ? "MT4/MT5" : account.account_type),
        roi: account.roi,
        drawdown: account.maximum_drawdown,
        audit: account.last_sync_error
          ? "Last synchronization requires attention"
          : account.ownership_verified === false
            ? "Ownership requires review"
            : "Provider status",
        status: accountStatus(account.connection_status)
      };
    })
  };
}
