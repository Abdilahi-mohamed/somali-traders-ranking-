import { getMongoCollections } from "./mongo.js";

export async function listLeaderboard() {
  const collections = await getMongoCollections();
  const freshnessLimit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const accounts = await collections.trading_accounts.find({
    account_type: "forex",
    connection_status: "verified_real",
    verified_account_type: "REAL",
    ownership_verified: true,
    metaapi_account_id: { $ne: null },
    roi: { $ne: null },
    last_successful_sync_at: { $gte: freshnessLimit }
  }).sort({ roi: -1 }).toArray();
  if (!accounts.length) return [];

  const traderIds = [...new Set(accounts.map((account) => account.trader_id))];
  const profiles = await collections.trader_profiles.find({ user_id: { $in: traderIds } })
    .project({ user_id: 1, trading_alias: 1, region: 1 })
    .toArray();
  const profilesById = new Map(profiles.map((profile) => [profile.user_id, profile]));

  return accounts.flatMap((account) => {
    const profile = profilesById.get(account.trader_id);
    if (!profile || account.roi === null) return [];
    const name = profile.trading_alias;
    return [{
      id: account.id,
      name,
      initials: name.split(/\s+/).slice(0, 2).map((part: string) => part[0] ?? "").join("").toUpperCase(),
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
