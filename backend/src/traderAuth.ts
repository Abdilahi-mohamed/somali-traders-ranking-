import { z } from "zod";
import { getSupabaseClients } from "./supabase.js";

export const traderLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

export class InvalidTraderCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidTraderCredentialsError";
  }
}

export async function loginTrader(email: string, password: string) {
  const { auth, database } = getSupabaseClients();
  const { data, error } = await auth.auth.signInWithPassword({ email: email.toLowerCase(), password });
  if (error || !data.user || !data.session) throw new InvalidTraderCredentialsError();

  const { data: trader, error: traderError } = await database
    .from("trader_profiles")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (traderError) throw traderError;
  if (!trader) throw new InvalidTraderCredentialsError();

  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in
  };
}

export async function getTraderFromAccessToken(accessToken: string) {
  const { auth, database } = getSupabaseClients();
  const { data, error } = await auth.auth.getUser(accessToken);
  if (error) {
    if (error.status === 401) return null;
    throw error;
  }
  if (!data.user) return null;

  const { data: trader, error: traderError } = await database
    .from("trader_profiles")
    .select("user_id, full_name, trading_alias")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (traderError) throw traderError;
  if (!trader) return null;
  return trader;
}
