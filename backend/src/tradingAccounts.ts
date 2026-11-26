import { z } from "zod";
import { evaluateAccountVerification, type ProviderAccountType, type VerificationStatus } from "./accountVerification.js";
import { isMetaApiConfigured } from "./config.js";
import { MetaApiRequestError, assertMetaApiAccountConnected, deployMetaApiAccount, provisionMetaApiAccount, removeMetaApiAccount, retrieveMetaApiAccountInformation, retrieveMetaApiDeals, retrieveMetaApiPositions, updateMetaApiCredentials, waitForMetaApiAccount, type MetaApiDeal, type MetaApiPosition } from "./metaApi.js";
import { getMongoCollections } from "./mongo.js";

const connectionInputSchema = z.object({
  investorPassword: z.string().min(1).max(256)
}).strict();

export type TradingAccount = Awaited<ReturnType<typeof getOwnedTradingAccount>>;
const connectionStatuses = ["not_connected", "connecting", "connected", "verified_real", "demo_account", "contest_account", "pending_verification", "connection_failed", "integration_not_configured", "disconnected"] as const;
type ConnectionStatus = typeof connectionStatuses[number];

const backgroundConnections = new Set<string>();

function isConnectionStatus(value: string): value is ConnectionStatus {
  return connectionStatuses.some((status) => status === value);
}

function legacyVerificationStatus(status: ConnectionStatus) {
  switch (status) {
    case "connected":
    case "verified_real":
    case "demo_account":
    case "contest_account":
    case "pending_verification":
    case "connection_failed":
    case "disconnected":
      return status;
    case "not_connected":
    case "connecting":
    case "integration_not_configured":
      return "pending_verification";
  }
}

export function parseConnectionInput(value: unknown) {
  return connectionInputSchema.safeParse(value);
}

export async function getOwnedTradingAccount(traderId: string, accountId: string) {
  const collections = await getMongoCollections();
  return collections.trading_accounts.findOne({ id: accountId, trader_id: traderId });
}

async function updateOwnedAccount(traderId: string, accountId: string, values: {
  connection_status?: ConnectionStatus;
  verification_status?: "connected" | "verified_real" | "demo_account" | "contest_account" | "pending_verification" | "connection_failed" | "disconnected";
  metaapi_account_id?: string | null;
  ownership_verified?: boolean | null;
  verified_account_type?: string | null;
  account_currency?: string | null;
  broker_name?: string | null;
  server_name?: string | null;
  balance?: number | null;
  equity?: number | null;
  free_margin?: number | null;
  used_margin?: number | null;
  leverage?: number | null;
  initial_balance?: number | null;
  total_pnl?: number | null;
  daily_pnl?: number | null;
  weekly_pnl?: number | null;
  monthly_pnl?: number | null;
  yearly_pnl?: number | null;
  total_trades?: number | null;
  winning_trades?: number | null;
  losing_trades?: number | null;
  win_rate?: number | null;
  roi?: number | null;
  maximum_drawdown?: number | null;
  first_connected_at?: string | null;
  last_successful_sync_at?: string | null;
  last_synced_at?: string | null;
  last_sync_error?: string | null;
}) {
  const collections = await getMongoCollections();
  const persistedValues = { ...values };
  if (values.connection_status) persistedValues.verification_status = legacyVerificationStatus(values.connection_status);
  if (values.last_successful_sync_at) persistedValues.last_synced_at = values.last_successful_sync_at;
  await collections.trading_accounts.updateOne(
    { id: accountId, trader_id: traderId },
    { $set: persistedValues }
  );
}

async function recordVerificationDecision(
  traderId: string,
  accountId: string,
  accountType: ProviderAccountType,
  status: VerificationStatus,
  reason: string
) {
  const collections = await getMongoCollections();
  await collections.trading_account_verification_audit.insertOne({
    trader_id: traderId,
    account_id: accountId,
    provider_account_type: accountType === "UNKNOWN" ? null : accountType,
    decision: status,
    reason
  });
}

async function clearRankingData(traderId: string, accountId: string, values: {
  connection_status: ConnectionStatus;
  verified_account_type: string | null;
  ownership_verified: boolean | null;
  last_sync_error: string | null;
}) {
  await updateOwnedAccount(traderId, accountId, {
    ...values,
    balance: null,
    equity: null,
    free_margin: null,
    used_margin: null,
    leverage: null,
    total_pnl: null,
    daily_pnl: null,
    weekly_pnl: null,
    monthly_pnl: null,
    yearly_pnl: null,
    total_trades: null,
    winning_trades: null,
    losing_trades: null,
    win_rate: null,
    roi: null,
    maximum_drawdown: null
  });
  const collections = await getMongoCollections();
  await collections.trading_open_positions.deleteMany({ account_id: accountId });
}

export function startTradingAccountConnection(traderId: string, accountId: string, investorPassword: string, reserved = false) {
  const key = `${traderId}:${accountId}`;
  if (backgroundConnections.has(key) && !reserved) return;
  backgroundConnections.add(key);
  void connectAndSynchronize(traderId, accountId, investorPassword)
    .catch(async (error: unknown) => {
      const code = error instanceof MetaApiRequestError ? error.providerCode : "connection_failed";
      console.error("MetaApi connection failed.", { accountId, code });
      try {
        await clearRankingData(traderId, accountId, {
          connection_status: "pending_verification",
          verified_account_type: null,
          ownership_verified: null,
          last_sync_error: code
        });
        await recordVerificationDecision(traderId, accountId, "UNKNOWN", "pending_verification", code);
      } catch {
        console.error("Could not save MetaApi connection verification status.", { accountId });
      }
    })
    .finally(() => backgroundConnections.delete(key));
}

async function connectAndSynchronize(traderId: string, accountId: string, investorPassword: string) {
  const account = await getOwnedTradingAccount(traderId, accountId);
  if (!account || account.account_type !== "forex" || !account.platform || !account.account_number || !account.server_name || !account.broker_name) {
    throw new Error("Trading account metadata is incomplete.");
  }
  if (!isMetaApiConfigured()) {
    await updateOwnedAccount(traderId, accountId, { connection_status: "integration_not_configured" });
    return;
  }

  await clearRankingData(traderId, accountId, {
    connection_status: "connecting",
    verified_account_type: null,
    ownership_verified: null,
    last_sync_error: null
  });
  let metaApiAccountId = account.metaapi_account_id;
  if (metaApiAccountId) {
    await updateMetaApiCredentials(metaApiAccountId, investorPassword);
  } else {
    metaApiAccountId = await provisionMetaApiAccount({
      platform: account.platform as "MT4" | "MT5",
      login: account.account_number,
      password: investorPassword,
      server: account.server_name,
      brokerName: account.broker_name
    });
    try {
      await updateOwnedAccount(traderId, accountId, { metaapi_account_id: metaApiAccountId });
    } catch (error) {
      try {
        await removeMetaApiAccountIfPresent(metaApiAccountId);
      } catch {
        console.error("Could not remove an unlinked MetaApi account.", { accountId });
        try {
          await updateOwnedAccount(traderId, accountId, {
            metaapi_account_id: metaApiAccountId,
            connection_status: "connection_failed",
            last_sync_error: "provider_cleanup_failed"
          });
        } catch {
          console.error("Could not save an unlinked MetaApi account reference.", { accountId });
        }
      }
      throw error;
    }
  }

  await deployMetaApiAccount(metaApiAccountId);
  await waitForMetaApiAccount(metaApiAccountId);
  await synchronizeAccountData(traderId, accountId, metaApiAccountId, account);
}

async function removeMetaApiAccountIfPresent(metaApiAccountId: string) {
  try {
    await removeMetaApiAccount(metaApiAccountId);
  } catch (error) {
    if (!(error instanceof MetaApiRequestError) || error.statusCode !== 404) throw error;
  }
}

function normalizeOwnerName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

async function verifyAccountOwner(traderId: string, providerName: string | null | undefined) {
  if (!providerName) return false;
  const profiles = (await getMongoCollections()).trader_profiles;
  const data = await profiles.findOne({ user_id: traderId }, { projection: { full_name: 1 } });
  if (!data?.full_name) return false;
  const registeredName = normalizeOwnerName(data.full_name);
  const providerAccountName = normalizeOwnerName(providerName);
  return registeredName.length > 0 && registeredName === providerAccountName;
}

function netDealPnl(deal: MetaApiDeal) {
  return (deal.profit ?? 0) + (deal.commission ?? 0) + (deal.swap ?? 0) + (deal.fee ?? 0);
}

function dealDate(deal: MetaApiDeal) {
  return deal.time instanceof Date ? deal.time : new Date(deal.time);
}

function closedTradeMetrics(deals: MetaApiDeal[]) {
  const tradeDeals = deals.filter((deal) => deal.type === "DEAL_TYPE_BUY" || deal.type === "DEAL_TYPE_SELL");
  const groups = new Map<string, { pnl: number; closed: boolean }>();
  for (const [index, deal] of tradeDeals.entries()) {
    const positionId = deal.positionId == null ? `deal:${deal.id}:${index}` : String(deal.positionId);
    const item = groups.get(positionId) ?? { pnl: 0, closed: false };
    item.pnl += netDealPnl(deal);
    item.closed ||= ["DEAL_ENTRY_OUT", "DEAL_ENTRY_INOUT", "DEAL_ENTRY_OUT_BY"].includes(deal.entryType ?? "");
    groups.set(positionId, item);
  }
  const closed = [...groups.values()].filter((item) => item.closed);
  const winning = closed.filter((item) => item.pnl > 0).length;
  const losing = closed.filter((item) => item.pnl < 0).length;
  return {
    totalTrades: closed.length,
    winningTrades: winning,
    losingTrades: losing,
    winRate: closed.length ? (winning / closed.length) * 100 : null,
    totalPnl: closed.reduce((sum, item) => sum + item.pnl, 0)
  };
}

async function snapshotDrawdown(accountId: string, currentEquity: number | null) {
  if (currentEquity === null) return null;
  const snapshots = (await getMongoCollections()).trading_account_snapshots;
  const [peak, drawdown] = await Promise.all([
    snapshots.findOne({ account_id: accountId, equity: { $ne: null } }, { sort: { equity: -1 }, projection: { equity: 1 } }),
    snapshots.findOne({ account_id: accountId, maximum_drawdown: { $ne: null } }, { sort: { maximum_drawdown: -1 }, projection: { maximum_drawdown: 1 } })
  ]);
  const peakEquity = typeof peak?.equity === "number" ? peak.equity : 0;
  const priorDrawdown = typeof drawdown?.maximum_drawdown === "number" ? drawdown.maximum_drawdown : 0;
  const peakValue = Math.max(peakEquity, currentEquity);
  const currentDrawdown = peakValue > 0 ? ((peakValue - currentEquity) / peakValue) * 100 : null;
  if (currentDrawdown === null) return drawdown?.maximum_drawdown ?? null;
  return Math.max(priorDrawdown, currentDrawdown);
}

async function retrieveCompleteHistory(metaApiAccountId: string, start: Date, end: Date, depth = 0): Promise<MetaApiDeal[]> {
  try {
    return await retrieveMetaApiDeals(metaApiAccountId, start, end);
  } catch (error) {
    if (!(error instanceof MetaApiRequestError) || error.providerCode !== "history_limit_exceeded" ||
        depth >= 16 || end.getTime() - start.getTime() < 60_000) throw error;
    const midpoint = new Date(Math.floor((start.getTime() + end.getTime()) / 2));
    const [earlier, later] = await Promise.all([
      retrieveCompleteHistory(metaApiAccountId, start, midpoint, depth + 1),
      retrieveCompleteHistory(metaApiAccountId, midpoint, end, depth + 1)
    ]);
    const uniqueDeals = new Map<string, MetaApiDeal>();
    for (const deal of [...earlier, ...later]) uniqueDeals.set(String(deal.id), deal);
    return [...uniqueDeals.values()].sort((first, second) => dealDate(first).getTime() - dealDate(second).getTime());
  }
}

function periodPnl(deals: MetaApiDeal[], start: Date) {
  return deals
    .filter((deal) => {
      const isTrade = deal.type === "DEAL_TYPE_BUY" || deal.type === "DEAL_TYPE_SELL";
      const isClose = ["DEAL_ENTRY_OUT", "DEAL_ENTRY_INOUT", "DEAL_ENTRY_OUT_BY"].includes(deal.entryType ?? "");
      return isTrade && isClose && dealDate(deal) >= start;
    })
    .reduce((sum, deal) => sum + netDealPnl(deal), 0);
}

function periods(now: Date) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = new Date(day);
  week.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return {
    day,
    week,
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    year: new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  };
}

async function saveDeals(accountId: string, deals: MetaApiDeal[]) {
  const history = (await getMongoCollections()).trading_history;
  const rows = deals.map((deal) => ({
    account_id: accountId,
    deal_id: String(deal.id),
    position_id: deal.positionId == null ? null : String(deal.positionId),
    deal_time: dealDate(deal).toISOString(),
    deal_type: deal.type,
    entry_type: deal.entryType ?? null,
    symbol: deal.symbol ?? null,
    volume: deal.volume ?? null,
    price: deal.price ?? null,
    profit: deal.profit ?? 0,
    commission: deal.commission ?? 0,
    swap: deal.swap ?? 0,
    fee: deal.fee ?? 0
  }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    await history.bulkWrite(rows.slice(offset, offset + 500).map((row) => ({
      updateOne: {
        filter: { account_id: accountId, deal_id: row.deal_id },
        update: { $set: row },
        upsert: true
      }
    })), { ordered: false });
  }
}

async function saveOpenPositions(accountId: string, positions: MetaApiPosition[]) {
  const collection = (await getMongoCollections()).trading_open_positions;
  await collection.deleteMany({ account_id: accountId });
  const rows = positions.map((position) => ({
    account_id: accountId,
    position_id: String(position.id),
    position_type: position.type,
    symbol: position.symbol,
    volume: position.volume,
    opened_at: position.time,
    open_price: position.openPrice,
    current_price: position.currentPrice ?? null,
    profit: position.profit ?? null,
    swap: position.swap ?? null,
    stop_loss: position.stopLoss ?? null,
    take_profit: position.takeProfit ?? null,
    last_synchronized_at: new Date().toISOString()
  }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    await collection.insertMany(rows.slice(offset, offset + 500));
  }
}

async function getAllStoredDeals(accountId: string): Promise<MetaApiDeal[]> {
  const history = (await getMongoCollections()).trading_history;
  const all: MetaApiDeal[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const rows = await history.find({ account_id: accountId })
      .sort({ deal_time: 1 })
      .skip(offset)
      .limit(1000)
      .toArray();
    all.push(...rows.map((row) => ({
      id: row.deal_id,
      positionId: row.position_id ?? undefined,
      time: row.deal_time,
      type: row.deal_type,
      entryType: row.entry_type ?? undefined,
      symbol: row.symbol ?? undefined,
      volume: row.volume ?? undefined,
      price: row.price ?? undefined,
      profit: row.profit,
      commission: row.commission,
      swap: row.swap,
      fee: row.fee
    })));
    if (rows.length < 1000) return all;
  }
  throw new MetaApiRequestError(413, "history_limit_exceeded");
}

async function synchronizeAccountData(traderId: string, accountId: string, metaApiAccountId: string, existingAccount?: TradingAccount) {
  await assertMetaApiAccountConnected(metaApiAccountId);
  const info = await retrieveMetaApiAccountInformation(metaApiAccountId);
  const ownershipVerified = await verifyAccountOwner(traderId, info.name);
  const decision = evaluateAccountVerification(info, {
    accountNumber: existingAccount?.account_number ?? "",
    server: existingAccount?.server_name ?? "",
    platform: existingAccount?.platform ?? ""
  }, ownershipVerified);
  if (decision.status !== "verified_real") {
    await recordVerificationDecision(traderId, accountId, decision.accountType, decision.status, decision.reason);
    await clearRankingData(traderId, accountId, {
      connection_status: decision.status,
      verified_account_type: decision.accountType === "UNKNOWN" ? null : decision.accountType,
      ownership_verified: ownershipVerified,
      last_sync_error: decision.reason
    });
    if (
      decision.status === "demo_account" ||
      decision.status === "contest_account" ||
      decision.status === "connection_failed" ||
      decision.reason === "provider_identity_unconfirmed" ||
      decision.reason === "account_ownership_unconfirmed"
    ) {
      await removeMetaApiAccountIfPresent(metaApiAccountId);
      await updateOwnedAccount(traderId, accountId, { metaapi_account_id: null });
    }
    return { investorMode: info.investorMode, accountType: decision.accountType };
  }

  const now = new Date();
  const firstConnectedAt = existingAccount?.first_connected_at ?? now.toISOString();
  const start = existingAccount?.last_successful_sync_at
    ? new Date(new Date(existingAccount.last_successful_sync_at).getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date("2000-01-01T00:00:00.000Z");
  const positions = await retrieveMetaApiPositions(metaApiAccountId);
  await saveOpenPositions(accountId, positions);
  const deals = await retrieveCompleteHistory(metaApiAccountId, start, now);
  await saveDeals(accountId, deals);
  const allDeals = await getAllStoredDeals(accountId);
  const metrics = closedTradeMetrics(allDeals);
  const period = periods(now);
  const mode = decision.accountType;
  const initialBalance = existingAccount?.initial_balance ?? info.balance ?? null;
  const roi = initialBalance && initialBalance > 0 && info.balance != null
    ? ((info.balance - initialBalance) / initialBalance) * 100
    : null;
  const values = {
    connection_status: "verified_real" as const,
    verified_account_type: mode,
    ownership_verified: ownershipVerified,
    broker_name: info.broker ?? existingAccount?.broker_name ?? null,
    server_name: info.server ?? existingAccount?.server_name ?? null,
    account_currency: info.currency ?? existingAccount?.account_currency ?? null,
    initial_balance: initialBalance,
    balance: info.balance ?? null,
    equity: info.equity ?? null,
    free_margin: info.freeMargin ?? null,
    used_margin: info.margin ?? null,
    leverage: info.leverage ?? null,
    total_pnl: metrics.totalPnl,
    daily_pnl: periodPnl(allDeals, period.day),
    weekly_pnl: periodPnl(allDeals, period.week),
    monthly_pnl: periodPnl(allDeals, period.month),
    yearly_pnl: periodPnl(allDeals, period.year),
    total_trades: metrics.totalTrades,
    winning_trades: metrics.winningTrades,
    losing_trades: metrics.losingTrades,
    win_rate: metrics.winRate,
    roi,
    maximum_drawdown: await snapshotDrawdown(accountId, info.equity ?? null),
    first_connected_at: firstConnectedAt,
    last_successful_sync_at: now.toISOString(),
    last_sync_error: null
  };
  await recordVerificationDecision(traderId, accountId, mode, "verified_real", decision.reason);
  await updateOwnedAccount(traderId, accountId, values);
  const snapshots = (await getMongoCollections()).trading_account_snapshots;
  await snapshots.insertOne({
    account_id: accountId,
    snapshot_at: now.toISOString(),
    account_type: mode,
    currency: values.account_currency,
    balance: values.balance,
    equity: values.equity,
    free_margin: values.free_margin,
    used_margin: values.used_margin,
    leverage: values.leverage,
    total_pnl: values.total_pnl,
    daily_pnl: values.daily_pnl,
    weekly_pnl: values.weekly_pnl,
    monthly_pnl: values.monthly_pnl,
    yearly_pnl: values.yearly_pnl,
    total_trades: values.total_trades,
    winning_trades: values.winning_trades,
    losing_trades: values.losing_trades,
    win_rate: values.win_rate,
    roi: values.roi,
    maximum_drawdown: values.maximum_drawdown
  });
  return { investorMode: info.investorMode, accountType: mode };
}

export async function connectOwnedTradingAccount(traderId: string, accountId: string, body: unknown) {
  const parsed = parseConnectionInput(body);
  if (!parsed.success) return { ok: false as const, statusCode: 400, status: null, error: "Enter an investor password." };
  const account = await getOwnedTradingAccount(traderId, accountId);
  if (!account) return { ok: false as const, statusCode: 404, status: null, error: "Trading account not found." };
  if (account.account_type !== "forex") return { ok: false as const, statusCode: 400, status: null, error: "MetaApi supports MT4/MT5 accounts only." };
  if (backgroundConnections.has(`${traderId}:${accountId}`)) {
    return { ok: false as const, statusCode: 409, status: null, error: "An account connection is already in progress." };
  }
  if (!isMetaApiConfigured()) {
    await updateOwnedAccount(traderId, accountId, { connection_status: "integration_not_configured" });
    return { ok: true as const, statusCode: 200, status: "integration_not_configured" as const };
  }
  const key = `${traderId}:${accountId}`;
  backgroundConnections.add(key);
  try {
    await updateOwnedAccount(traderId, accountId, { connection_status: "connecting", last_sync_error: null });
  } catch (error) {
    backgroundConnections.delete(key);
    throw error;
  }
  startTradingAccountConnection(traderId, accountId, parsed.data.investorPassword, true);
  return { ok: true as const, statusCode: 202, status: "connecting" as const };
}

export async function refreshOwnedTradingAccount(traderId: string, accountId: string) {
  const account = await getOwnedTradingAccount(traderId, accountId);
  if (!account) return { ok: false as const, statusCode: 404, error: "Trading account not found." };
  if (!isMetaApiConfigured()) {
    await updateOwnedAccount(traderId, accountId, { connection_status: "integration_not_configured" });
    return { ok: true as const, statusCode: 200, status: "integration_not_configured" as const };
  }
  if (!account.metaapi_account_id) {
    return { ok: false as const, statusCode: 409, error: "Connect this account before refreshing its data." };
  }
  if (backgroundConnections.has(`${traderId}:${accountId}`)) {
    return { ok: true as const, statusCode: 202, status: "connecting" as const };
  }
  const key = `${traderId}:${accountId}`;
  if (!isConnectionStatus(account.connection_status)) {
    return { ok: false as const, statusCode: 409, error: "Trading account has an unsupported connection status." };
  }
  backgroundConnections.add(key);
  try {
    await clearRankingData(traderId, accountId, {
      connection_status: "connecting",
      verified_account_type: null,
      ownership_verified: null,
      last_sync_error: null
    });
  } catch (error) {
    backgroundConnections.delete(key);
    throw error;
  }
  void synchronizeAccountData(traderId, accountId, account.metaapi_account_id, account)
    .catch(async (error: unknown) => {
      const code = error instanceof MetaApiRequestError ? error.providerCode : "synchronization_failed";
      console.error("MetaApi synchronization failed.", { accountId, code });
      try {
        await clearRankingData(traderId, accountId, {
          connection_status: "pending_verification",
          verified_account_type: null,
          ownership_verified: null,
          last_sync_error: code
        });
        await recordVerificationDecision(traderId, accountId, "UNKNOWN", "pending_verification", code);
      } catch {
        console.error("Could not save MetaApi verification failure status.", { accountId });
      }
    })
    .finally(() => backgroundConnections.delete(key));
  return { ok: true as const, statusCode: 202, status: "connecting" as const };
}

export async function disconnectOwnedTradingAccount(traderId: string, accountId: string) {
  const account = await getOwnedTradingAccount(traderId, accountId);
  if (!account) return { ok: false as const, statusCode: 404, error: "Trading account not found." };
  if (backgroundConnections.has(`${traderId}:${accountId}`)) {
    return { ok: false as const, statusCode: 409, error: "Account synchronization is in progress. Try disconnecting again shortly." };
  }
  if (account.metaapi_account_id && !isMetaApiConfigured()) {
    return { ok: false as const, statusCode: 503, error: "MetaApi integration is not configured; remote credentials could not be revoked." };
  }
  if (account.metaapi_account_id) {
    await removeMetaApiAccountIfPresent(account.metaapi_account_id);
  }
  await updateOwnedAccount(traderId, accountId, {
    connection_status: "disconnected",
    metaapi_account_id: null,
    verified_account_type: null,
    ownership_verified: null,
    last_sync_error: null
  });
  const positions = (await getMongoCollections()).trading_open_positions;
  await positions.deleteMany({ account_id: accountId });
  return { ok: true as const, statusCode: 200, status: "disconnected" as const };
}

export async function listOwnedTradingAccounts(traderId: string) {
  const accounts = await (await getMongoCollections()).trading_accounts.find({ trader_id: traderId })
    .project({
      _id: 0,
      id: 1,
      account_type: 1,
      platform: 1,
      broker_name: 1,
      server_name: 1,
      account_number: 1,
      account_currency: 1,
      connection_status: 1,
      verified_account_type: 1,
      ownership_verified: 1,
      balance: 1,
      equity: 1,
      total_pnl: 1,
      roi: 1,
      win_rate: 1,
      maximum_drawdown: 1,
      last_successful_sync_at: 1,
      last_sync_error: 1,
      metaapi_account_id: 1
    })
    .toArray();
  return accounts.map(({ metaapi_account_id, last_sync_error, ...account }) => ({
    ...account,
    has_connection: Boolean(metaapi_account_id),
    connection_message: last_sync_error ? connectionMessage(last_sync_error) : null,
    account_number: account.account_number ? `••••${account.account_number.slice(-4)}` : null
  }));
}

function connectionMessage(errorCode: string) {
  switch (errorCode) {
    case "investor_mode_not_confirmed":
      return "MetaApi could not confirm investor-only access. Use an Investor Password; master-password connections are not accepted.";
    case "account_mode_unavailable":
    case "account_type_unavailable":
      return "MetaApi did not provide the account mode needed for verification. This account remains Pending Verification.";
    case "provider_identity_unconfirmed":
      return "MetaApi could not confirm that the connected login, server, and platform match this registration. The account remains Pending Verification.";
    case "account_ownership_unconfirmed":
      return "MetaApi could not confirm that you own this account. The account remains Pending Verification.";
    case "demo_account_rejected":
      return "Demo accounts are not accepted and cannot appear in SomTraders rankings.";
    case "contest_account_rejected":
      return "Contest accounts are not accepted and cannot appear in SomTraders rankings.";
    case "provider_unavailable":
      return "MetaApi could not be reached. Try again later.";
    case "account_disconnected":
      return "MetaApi reports that this account is disconnected. Ranking eligibility remains suspended until it can be re-verified.";
    case "connection_timeout":
      return "The broker connection timed out. Check the broker server and try again.";
    case "history_synchronizing":
      return "MetaApi is still synchronizing this account's trading history. Try refreshing shortly.";
    case "invalid_provider_response":
      return "MetaApi returned account data this integration could not validate.";
    case "provider_cleanup_failed":
      return "MetaApi account cleanup needs attention. Contact support before trying another account.";
    case "provider_request_failed":
    case "connection_failed":
      return "MetaApi could not connect. Check the account login, broker server, Investor Password, and broker compatibility.";
    default:
      return "The latest account operation failed. Check the account details and try again.";
  }
}

export async function listOwnedTradingOpenPositions(traderId: string, accountId: string) {
  const account = await getOwnedTradingAccount(traderId, accountId);
  if (!account) return null;
  if (
    account.connection_status !== "verified_real" ||
    account.verified_account_type !== "REAL" ||
    account.ownership_verified !== true
  ) return [];
  return (await getMongoCollections()).trading_open_positions.find({ account_id: accountId })
    .project({
      _id: 0,
      position_id: 1,
      position_type: 1,
      symbol: 1,
      volume: 1,
      opened_at: 1,
      open_price: 1,
      current_price: 1,
      profit: 1,
      swap: 1,
      stop_loss: 1,
      take_profit: 1,
      last_synchronized_at: 1
    })
    .sort({ opened_at: -1 })
    .toArray();
}

export async function synchronizeConnectedAccounts() {
  if (!isMetaApiConfigured()) return;
  const accounts = await (await getMongoCollections()).trading_accounts.find({
    metaapi_account_id: { $ne: null },
    connection_status: { $in: ["verified_real", "demo_account", "contest_account", "connected", "pending_verification", "connecting"] }
  }).toArray();
  for (const account of accounts) {
    if (!account.metaapi_account_id || backgroundConnections.has(`${account.trader_id}:${account.id}`)) continue;
    const key = `${account.trader_id}:${account.id}`;
    backgroundConnections.add(key);
    if (!isConnectionStatus(account.connection_status)) {
      backgroundConnections.delete(key);
      continue;
    }
    try {
      await clearRankingData(account.trader_id, account.id, {
        connection_status: "connecting",
        verified_account_type: null,
        ownership_verified: null,
        last_sync_error: null
      });
    } catch (cause) {
      backgroundConnections.delete(key);
      throw cause;
    }
    void synchronizeAccountData(account.trader_id, account.id, account.metaapi_account_id, account)
      .catch(async (cause: unknown) => {
        const code = cause instanceof MetaApiRequestError ? cause.providerCode : "synchronization_failed";
        console.error("Scheduled MetaApi synchronization failed.", { accountId: account.id, code });
        try {
          await clearRankingData(account.trader_id, account.id, {
            connection_status: "pending_verification",
            verified_account_type: null,
            ownership_verified: null,
            last_sync_error: code
          });
          await recordVerificationDecision(account.trader_id, account.id, "UNKNOWN", "pending_verification", code);
        } catch {
          console.error("Could not save scheduled verification failure status.", { accountId: account.id });
        }
      })
      .finally(() => backgroundConnections.delete(key));
  }
}

export function metaApiIntegrationStatus() {
  return isMetaApiConfigured()
    ? { configured: true, status: "available" as const }
    : { configured: false, status: "integration_not_configured" as const };
}
