import { z } from "zod";
import { isMetaApiConfigured } from "./config.js";
import { MetaApiRequestError, deployMetaApiAccount, provisionMetaApiAccount, removeMetaApiAccount, retrieveMetaApiAccountInformation, retrieveMetaApiDeals, retrieveMetaApiPositions, updateMetaApiCredentials, waitForMetaApiAccount, type MetaApiDeal, type MetaApiPosition } from "./metaApi.js";
import { getSupabaseClients } from "./supabase.js";

const connectionInputSchema = z.object({
  investorPassword: z.string().min(1).max(256)
}).strict();

export type TradingAccount = Awaited<ReturnType<typeof getOwnedTradingAccount>>;
const connectionStatuses = ["not_connected", "connecting", "connected", "verified_real", "demo_account", "pending_verification", "connection_failed", "integration_not_configured", "disconnected"] as const;
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
  const { database } = getSupabaseClients();
  const { data, error } = await database
    .from("trading_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("trader_id", traderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateOwnedAccount(traderId: string, accountId: string, values: {
  connection_status?: ConnectionStatus;
  verification_status?: "connected" | "verified_real" | "demo_account" | "pending_verification" | "connection_failed" | "disconnected";
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
  const { database } = getSupabaseClients();
  const persistedValues = { ...values };
  if (values.connection_status) persistedValues.verification_status = legacyVerificationStatus(values.connection_status);
  if (values.last_successful_sync_at) persistedValues.last_synced_at = values.last_successful_sync_at;
  const { error } = await database
    .from("trading_accounts")
    .update(persistedValues)
    .eq("id", accountId)
    .eq("trader_id", traderId);
  if (error) throw error;
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
        await updateOwnedAccount(traderId, accountId, {
          connection_status: "connection_failed",
          last_sync_error: code
        });
      } catch {
        console.error("Could not save MetaApi connection failure status.", { accountId });
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

  await updateOwnedAccount(traderId, accountId, { connection_status: "connecting", last_sync_error: null });
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

function providerAccountType(value: string | null | undefined) {
  const normalized = value?.toUpperCase();
  if (normalized === "ACCOUNT_TRADE_MODE_REAL" || normalized === "REAL") return "REAL";
  if (normalized === "ACCOUNT_TRADE_MODE_DEMO" || normalized === "DEMO") return "DEMO";
  if (normalized === "ACCOUNT_TRADE_MODE_CONTEST" || normalized === "CONTEST") return "CONTEST";
  return null;
}

function connectionStatus(type: string | null, investorMode: boolean, ownershipVerified: boolean): ConnectionStatus {
  if (!type || !ownershipVerified) return "pending_verification";
  if (type === "REAL" && investorMode) return "verified_real";
  if (type === "DEMO") return "demo_account";
  return "connected";
}

async function removeMetaApiAccountIfPresent(metaApiAccountId: string) {
  try {
    await removeMetaApiAccountIfPresent(metaApiAccountId);
  } catch (error) {
    if (!(error instanceof MetaApiRequestError) || error.statusCode !== 404) throw error;
  }
}

function normalizeOwnerName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

async function verifyAccountOwner(traderId: string, providerName: string | null | undefined) {
  if (!providerName) return false;
  const { database } = getSupabaseClients();
  const { data, error } = await database
    .from("trader_profiles")
    .select("full_name")
    .eq("user_id", traderId)
    .maybeSingle();
  if (error) throw error;
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
  const { database } = getSupabaseClients();
  const [peakResult, drawdownResult] = await Promise.all([
    database.from("trading_account_snapshots")
      .select("equity")
      .eq("account_id", accountId)
      .not("equity", "is", null)
      .order("equity", { ascending: false })
      .limit(1)
      .maybeSingle(),
    database.from("trading_account_snapshots")
      .select("maximum_drawdown")
      .eq("account_id", accountId)
      .not("maximum_drawdown", "is", null)
      .order("maximum_drawdown", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (peakResult.error) throw peakResult.error;
  if (drawdownResult.error) throw drawdownResult.error;
  const peak = Math.max(peakResult.data?.equity ?? 0, currentEquity);
  const currentDrawdown = peak > 0 ? ((peak - currentEquity) / peak) * 100 : null;
  if (currentDrawdown === null) return drawdownResult.data?.maximum_drawdown ?? null;
  return Math.max(drawdownResult.data?.maximum_drawdown ?? 0, currentDrawdown);
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
  const { database } = getSupabaseClients();
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
    const { error } = await database.from("trading_history").upsert(rows.slice(offset, offset + 500), {
      onConflict: "account_id,deal_id"
    });
    if (error) throw error;
  }
}

async function saveOpenPositions(accountId: string, positions: MetaApiPosition[]) {
  const { database } = getSupabaseClients();
  const { error: deleteError } = await database
    .from("trading_open_positions")
    .delete()
    .eq("account_id", accountId);
  if (deleteError) throw deleteError;
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
    const { error } = await database.from("trading_open_positions").insert(rows.slice(offset, offset + 500));
    if (error) throw error;
  }
}

async function getAllStoredDeals(accountId: string): Promise<MetaApiDeal[]> {
  const { database } = getSupabaseClients();
  const all: MetaApiDeal[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await database
      .from("trading_history")
      .select("deal_id, position_id, deal_time, deal_type, entry_type, symbol, volume, price, profit, commission, swap, fee")
      .eq("account_id", accountId)
      .order("deal_time", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const rows = data ?? [];
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
  const info = await retrieveMetaApiAccountInformation(metaApiAccountId);
  if (info.investorMode !== true) {
    await updateOwnedAccount(traderId, accountId, {
      connection_status: info.investorMode === false ? "connection_failed" : "pending_verification",
      verified_account_type: null,
      ownership_verified: info.investorMode === false ? false : null,
      last_sync_error: info.investorMode === false ? "investor_mode_not_confirmed" : "account_mode_unavailable"
    });
    await removeMetaApiAccount(metaApiAccountId);
    await updateOwnedAccount(traderId, accountId, { metaapi_account_id: null });
    return { investorMode: info.investorMode, accountType: null };
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
  const mode = providerAccountType(info.tradeMode);
  const ownershipVerified = await verifyAccountOwner(traderId, info.name);
  const status = connectionStatus(mode, info.investorMode, ownershipVerified);
  const initialBalance = existingAccount?.initial_balance ?? info.balance ?? null;
  const roi = initialBalance && initialBalance > 0 && info.balance != null
    ? ((info.balance - initialBalance) / initialBalance) * 100
    : null;
  const values = {
    connection_status: status,
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
  await updateOwnedAccount(traderId, accountId, values);
  const { database } = getSupabaseClients();
  const { error } = await database.from("trading_account_snapshots").insert({
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
  if (error) throw error;
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
  const previousStatus = account.connection_status;
  backgroundConnections.add(key);
  try {
    await updateOwnedAccount(traderId, accountId, { connection_status: "connecting", last_sync_error: null });
  } catch (error) {
    backgroundConnections.delete(key);
    throw error;
  }
  void synchronizeAccountData(traderId, accountId, account.metaapi_account_id, account)
    .catch(async (error: unknown) => {
      const code = error instanceof MetaApiRequestError ? error.providerCode : "synchronization_failed";
      console.error("MetaApi synchronization failed.", { accountId, code });
      try {
        await updateOwnedAccount(traderId, accountId, {
          connection_status: previousStatus,
          last_sync_error: code
        });
      } catch {
        console.error("Could not save MetaApi synchronization failure status.", { accountId });
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
  const { database } = getSupabaseClients();
  const { error: positionsError } = await database
    .from("trading_open_positions")
    .delete()
    .eq("account_id", accountId);
  if (positionsError) throw positionsError;
  return { ok: true as const, statusCode: 200, status: "disconnected" as const };
}

export async function listOwnedTradingAccounts(traderId: string) {
  const { database } = getSupabaseClients();
  const { data, error } = await database
    .from("trading_accounts")
    .select("id, account_type, platform, broker_name, server_name, account_number, account_currency, connection_status, verified_account_type, ownership_verified, balance, equity, total_pnl, roi, win_rate, maximum_drawdown, last_successful_sync_at, last_sync_error, metaapi_account_id")
    .eq("trader_id", traderId);
  if (error) throw error;
  return (data ?? []).map(({ metaapi_account_id, last_sync_error, ...account }) => ({
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
      return "MetaApi did not provide the account mode needed for verification. This account remains Pending Verification.";
    case "provider_unavailable":
      return "MetaApi could not be reached. Try again later.";
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
  const { database } = getSupabaseClients();
  const { data, error } = await database
    .from("trading_open_positions")
    .select("position_id, position_type, symbol, volume, opened_at, open_price, current_price, profit, swap, stop_loss, take_profit, last_synchronized_at")
    .eq("account_id", accountId)
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function synchronizeConnectedAccounts() {
  if (!isMetaApiConfigured()) return;
  const { database } = getSupabaseClients();
  const { data, error } = await database
    .from("trading_accounts")
    .select("*")
    .not("metaapi_account_id", "is", null)
    .in("connection_status", ["verified_real", "demo_account", "connected", "pending_verification", "connecting"]);
  if (error) throw error;
  for (const account of data ?? []) {
    if (!account.metaapi_account_id || backgroundConnections.has(`${account.trader_id}:${account.id}`)) continue;
    const key = `${account.trader_id}:${account.id}`;
    backgroundConnections.add(key);
    if (!isConnectionStatus(account.connection_status)) {
      backgroundConnections.delete(key);
      continue;
    }
    const previousStatus = account.connection_status;
    try {
      await updateOwnedAccount(account.trader_id, account.id, { connection_status: "connecting", last_sync_error: null });
    } catch (cause) {
      backgroundConnections.delete(key);
      throw cause;
    }
    void synchronizeAccountData(account.trader_id, account.id, account.metaapi_account_id, account)
      .catch(async (cause: unknown) => {
        const code = cause instanceof MetaApiRequestError ? cause.providerCode : "synchronization_failed";
        console.error("Scheduled MetaApi synchronization failed.", { accountId: account.id, code });
        try {
          await updateOwnedAccount(account.trader_id, account.id, {
            connection_status: previousStatus,
            last_sync_error: code
          });
        } catch {
          console.error("Could not save scheduled synchronization failure status.", { accountId: account.id });
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
