import { z } from "zod";
import { getSupabaseClients } from "./supabase.js";

export const adminLoginSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();

export class InvalidAdminCredentialsError extends Error {
  constructor() {
    super("Invalid username or password.");
    this.name = "InvalidAdminCredentialsError";
  }
}

export async function loginAdmin(username: string, password: string) {
  const { auth, database } = getSupabaseClients();
  const { data: admin, error: adminError } = await database
    .from("admin_users")
    .select("user_id, username, email")
    .eq("username", username)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin) throw new InvalidAdminCredentialsError();

  const { data, error } = await auth.auth.signInWithPassword({ email: admin.email, password });
  if (error) {
    if (error.status === 400 || error.status === 401) throw new InvalidAdminCredentialsError();
    throw error;
  }
  if (!data.user || !data.session || data.user.id !== admin.user_id) {
    throw new InvalidAdminCredentialsError();
  }

  return {
    accessToken: data.session.access_token,
    expiresIn: data.session.expires_in,
    user: { id: admin.user_id, username: admin.username, email: admin.email }
  };
}

export async function getAdminFromAccessToken(accessToken: string) {
  const { auth, database } = getSupabaseClients();
  const { data, error } = await auth.auth.getUser(accessToken);
  if (error) {
    if (error.status === 401) return null;
    throw error;
  }
  if (!data.user) return null;

  const { data: admin, error: adminError } = await database
    .from("admin_users")
    .select("user_id, username, email")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin) return null;

  return { id: admin.user_id, username: admin.username, email: admin.email };
}
