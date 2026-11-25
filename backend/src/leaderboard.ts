import { getSupabaseClients } from "./supabase.js";

export async function listLeaderboard() {
  const { database } = getSupabaseClients();
  const freshnessLimit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: accounts, error: accountError } = await database
    .from("trading_accounts")
    .select("id, trader_id, platform, broker_name, account_currency, equity, show_balance, total_pnl, roi, win_rate, maximum_drawdown")
    .eq("account_type", "forex")
    .eq("connection_status", "verified_real")
    .eq("verified_account_type", "REAL")
    .eq("ownership_verified", true)
    .not("metaapi_account_id", "is", null)
    .not("roi", "is", null)
    .gte("last_successful_sync_at", freshnessLimit)
    .order("roi", { ascending: false });
  if (accountError) throw accountError;
  if (!accounts?.length) return [];

  const traderIds = [...new Set(accounts.map((account) => account.trader_id))];
  const { data: profiles, error: profileError } = await database
    .from("trader_profiles")
    .select("user_id, trading_alias, region")
    .in("user_id", traderIds);
  if (profileError) throw profileError;
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return accounts.flatMap((account) => {
    const profile = profilesById.get(account.trader_id);
    if (!profile || account.roi === null) return [];
    const name = profile.trading_alias;
    return [{
      id: account.id,
      name,
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(),
      city: profile.region,
      account: account.broker_name ?? "MetaTrader account",
      platform: account.platform ?? "MetaTrader",
      roi: account.roi,
      drawdown: account.maximum_drawdown,
      winRate: account.win_rate,
      equity: account.show_balance ? account.equity : null,
      pnl: account.total_pnl,
      currency: account.account_currency
    }];
  });
}
