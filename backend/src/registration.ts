import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "./config.js";
import { database } from "./database.js";

const accountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("forex"),
    category: z.enum(["live", "prop"]),
    propFirm: z.string().trim().max(80).optional(),
    platform: z.enum(["MT4", "MT5"]),
    brokerName: z.string().trim().min(2).max(80),
    server: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().regex(/^\d{4,20}$/),
    showBalance: z.boolean()
  }).superRefine((account, context) => {
    if (account.category === "prop" && !account.propFirm) {
      context.addIssue({ code: "custom", path: ["propFirm"], message: "Select a prop firm." });
    }
  }),
  z.object({
    type: z.literal("crypto"),
    exchange: z.enum(["Binance", "Bybit", "OKX", "Other"]),
    accountLabel: z.string().trim().max(80).default(""),
    showBalance: z.boolean()
  })
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
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export async function registerTrader(input: RegistrationInput) {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  const traderId = randomUUID();
  const accountId = randomUUID();
  const createdAt = new Date().toISOString();
  const account = input.account;

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO traders
        (id, full_name, trading_alias, email, phone, region, social_profile, password_hash, consent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      traderId,
      input.fullName,
      input.alias,
      input.email.toLowerCase(),
      input.phone,
      input.region,
      input.social,
      passwordHash,
      createdAt,
      createdAt
    );

    if (account.type === "forex") {
      database.prepare(`
        INSERT INTO trading_accounts
          (id, trader_id, account_type, account_category, prop_firm, platform, broker_name, server_name, account_number, show_balance)
        VALUES (?, ?, 'forex', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        accountId,
        traderId,
        account.category,
        account.propFirm ?? null,
        account.platform,
        account.brokerName,
        account.server,
        account.accountNumber,
        Number(account.showBalance)
      );
    } else {
      database.prepare(`
        INSERT INTO trading_accounts
          (id, trader_id, account_type, exchange_name, account_label, show_balance)
        VALUES (?, ?, 'crypto', ?, ?, ?)
      `).run(
        accountId,
        traderId,
        account.exchange,
        account.accountLabel,
        Number(account.showBalance)
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: traders.email")) {
      throw new DuplicateEmailError();
    }
    throw error;
  }

  return { id: traderId, status: "pending_verification" as const };
}
