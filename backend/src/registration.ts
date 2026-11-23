import { z } from "zod";
import { getSupabaseClients } from "./supabase.js";

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
  }).strict(),
  z.object({
    type: z.literal("crypto"),
    exchange: z.enum(["Binance", "Bybit", "OKX", "Other"]),
    accountLabel: z.string().trim().max(80).default(""),
    showBalance: z.boolean()
  }).strict()
]).superRefine((account, context) => {
  if (account.type === "forex" && account.category === "prop" && !account.propFirm) {
    context.addIssue({ code: "custom", path: ["propFirm"], message: "Select a prop firm." });
  }
});

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

export async function registerTrader(input: RegistrationInput) {
  const { auth, database } = getSupabaseClients();
  const { data, error } = await auth.auth.signUp({
    email: input.email.toLowerCase(),
    password: input.password,
    options: { data: { trading_alias: input.alias } }
  });

  if (error) {
    if (error.code === "user_already_exists" || error.message.toLowerCase().includes("already registered")) {
      throw new DuplicateEmailError();
    }
    throw error;
  }
  if (!data.user) {
    throw new Error("Supabase Auth did not return a user after signup.");
  }
  if (data.user.identities?.length === 0) {
    throw new DuplicateEmailError();
  }

  const { error: profileError } = await database.rpc("create_trader_registration", {
    p_user_id: data.user.id,
    p_full_name: input.fullName,
    p_alias: input.alias,
    p_email: input.email.toLowerCase(),
    p_phone: input.phone,
    p_region: input.region,
    p_social: input.social,
    p_account: input.account,
    p_consent_at: new Date().toISOString()
  });

  if (profileError) {
    const { error: cleanupError } = await database.auth.admin.deleteUser(data.user.id);
    if (cleanupError) {
      console.error("Could not remove Supabase Auth user after profile creation failed.", cleanupError.message);
    }
    throw profileError;
  }

  return {
    id: data.user.id,
    status: "pending_verification" as const,
    emailConfirmationRequired: !data.session
  };
}
