import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, createSessionToken } from "./authTokens.js";
import { isMetaApiConfigured } from "./config.js";
import { getMongoCollections, isDuplicateEmailKeyError, isDuplicateKeyError } from "./mongo.js";
import { startTradingAccountConnection } from "./tradingAccounts.js";

const accountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("forex"),
    platform: z.enum(["MT4", "MT5"]),
    brokerName: z.string().trim().min(2).max(80),
    server: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().regex(/^\d{4,20}$/),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
    investorPassword: z.string().max(256).optional().transform((value) => value === "" ? undefined : value),
    showBalance: z.boolean()
  }).strict(),
  z.object({
    type: z.literal("crypto"),
    exchange: z.enum(["Binance", "Bybit", "OKX", "Other"]),
    accountLabel: z.string().trim().max(80).default(""),
    showBalance: z.boolean()
  }).strict()
]);

export const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  alias: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(24),
  region: z.enum(["Boorama", "Hargeysa", "Muqdisho", "Garoowe", "Qurbaha / Diaspora"]),
  social: z.string().trim().max(200).default(""),
  password: z.string().min(10).max(128),
  consent: z.literal(true),
  account: accountSchema
}).strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export class DuplicateTradingAccountError extends Error {
  constructor() {
    super("This MT4/MT5 account has already been registered.");
    this.name = "DuplicateTradingAccountError";
  }
}

function isDuplicateEmailError(error: unknown) {
  return isDuplicateEmailKeyError(error);
}

export async function registerTrader(input: RegistrationInput) {
  const collections = await getMongoCollections();
  const email = input.email.toLowerCase();
  const existing = await collections.trader_profiles.findOne({ email }, { collation: { locale: "en", strength: 2 } });
  if (existing) throw new DuplicateEmailError();

  const userId = randomUUID();
  const accountId = randomUUID();
  const now = new Date().toISOString();
  const { investorPassword, ...accountToSave } = input.account.type === "forex"
    ? input.account
    : { ...input.account, investorPassword: undefined };
  const profile = {
    user_id: userId,
    full_name: input.fullName,
    trading_alias: input.alias,
    email,
    phone: input.phone,
    region: input.region,
    social_profile: input.social,
    status: "pending_verification",
    consent_at: now,
    created_at: now,
    password_hash: await hashPassword(input.password)
  };
  const commonAccountFields = {
    id: accountId,
    trader_id: userId,
    account_category: null,
    prop_firm: null,
    platform: accountToSave.type === "forex" ? accountToSave.platform : null,
    broker_name: accountToSave.type === "forex" ? accountToSave.brokerName : null,
    server_name: accountToSave.type === "forex" ? accountToSave.server : null,
    account_number: accountToSave.type === "forex" ? accountToSave.accountNumber : null,
    account_currency: accountToSave.type === "forex" ? accountToSave.currency : null,
    verification_status: "pending_verification",
    verified_account_type: null,
    last_synced_at: null,
    connection_status: "not_connected",
    metaapi_account_id: null,
    ownership_verified: null,
    initial_balance: null,
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
    maximum_drawdown: null,
    first_connected_at: null,
    last_successful_sync_at: null,
    last_sync_error: null,
    exchange_name: accountToSave.type === "crypto" ? accountToSave.exchange : null,
    account_label: accountToSave.type === "crypto" ? accountToSave.accountLabel : null,
    show_balance: accountToSave.showBalance,
    created_at: now
  };
  const account = {
    ...commonAccountFields,
    account_type: accountToSave.type
  };

  try {
    await collections.trader_profiles.insertOne(profile);
    await collections.trading_accounts.insertOne(account);
  } catch (error) {
    try {
      await collections.trader_profiles.deleteOne({ user_id: userId });
    } catch (cleanupError) {
      console.error("Could not remove a partial trader registration.", { traderId: userId });
      throw new Error("Trader registration failed and profile cleanup was unsuccessful.", { cause: cleanupError });
    }
    if (isDuplicateEmailError(error)) throw new DuplicateEmailError();
    if (accountToSave.type === "forex" && isDuplicateKeyError(error)) {
      throw new DuplicateTradingAccountError();
    }
    throw error;
  }

  let connectionStatus: string | null = null;
  if (accountToSave.type === "forex") {
    if (investorPassword && isMetaApiConfigured()) {
      connectionStatus = "connecting";
      startTradingAccountConnection(userId, accountId, investorPassword);
    } else if (investorPassword) {
      connectionStatus = "integration_not_configured";
      await collections.trading_accounts.updateOne(
        { id: accountId, trader_id: userId },
        { $set: { connection_status: connectionStatus } }
      );
    } else {
      connectionStatus = isMetaApiConfigured() ? "not_connected" : "integration_not_configured";
    }
  }

  const { token } = createSessionToken(userId, "trader");
  return {
    id: userId,
    status: "pending_verification" as const,
    emailConfirmationRequired: false,
    accessToken: token,
    tradingAccountId: accountId,
    connectionStatus
  };
}
