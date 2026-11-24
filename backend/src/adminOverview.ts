import { isMetaApiConfigured } from "./config.js";
import { getSupabaseClients } from "./supabase.js";

const pendingStatuses = ["not_connected", "connecting", "pending_verification", "integration_not_configured"];

function accountStatus(connectionStatus: string) {
  switch (connectionStatus) {
    case "not_connected": return "Not Connected";
    case "connecting": return "Connecting";
    case "connected": return "Connected";
    case "verified_real": return "Verified Real";
    case "demo_account": return "Demo Account";
    case "pending_verification": return "Pending Verification";
    case "connection_failed": return "Connection Failed";
    case "integration_not_configured": return "Integration Not Configured";
    case "disconnected": return "Disconnected";
    default: return "Pending Verification";
  }
}

export async function getAdminOverview() {
  const { database } = getSupabaseClients();
  const [
    { count: registeredTraders, error: traderCountError },
    { data: accounts, error: accountError }
  ] = await Promise.all([
    database.from("trader_profiles").select("user_id", { count: "exact", head: true }),
    database.from("trading_accounts")
      .select("id, trader_id, platform, broker_name, server_name, account_number, account_type, verified_account_type, ownership_verified, connection_status, roi, maximum_drawdown, last_sync_error")
  ]);
  if (traderCountError) throw traderCountError;
  if (accountError) throw accountError;

  const rows = accounts ?? [];
  const traderIds = [...new Set(rows.map((account) => account.trader_id))];
  const { data: profiles, error: profileError } = traderIds.length
    ? await database.from("trader_profiles").select("user_id, full_name, trading_alias, email, region").in("user_id", traderIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const verifiedTraders = new Set(rows.filter((account) => account.connection_status === "verified_real").map((account) => account.trader_id)).size;
  const pendingVerifications = rows.filter((account) => pendingStatuses.includes(account.connection_status)).length;
  const flaggedAccounts = rows.filter((account) => account.connection_status === "connection_failed").length;

  return {
    registeredTraders: registeredTraders ?? 0,
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
