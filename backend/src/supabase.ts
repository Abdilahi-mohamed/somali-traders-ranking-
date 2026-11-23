import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Database = {
  public: {
    Tables: {
      trader_profiles: {
        Row: { user_id: string; full_name: string; trading_alias: string; email: string; phone: string; region: string; social_profile: string; status: string; consent_at: string; created_at: string };
        Insert: { user_id: string; full_name: string; trading_alias: string; email: string; phone: string; region: string; social_profile?: string; status?: string; consent_at: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["trader_profiles"]["Insert"]>;
        Relationships: [];
      };
      trading_accounts: {
        Row: { id: string; trader_id: string; account_type: string; account_category: string | null; prop_firm: string | null; platform: string | null; broker_name: string | null; server_name: string | null; account_number: string | null; exchange_name: string | null; account_label: string | null; show_balance: boolean; created_at: string };
        Insert: { id?: string; trader_id: string; account_type: string; account_category?: string | null; prop_firm?: string | null; platform?: string | null; broker_name?: string | null; server_name?: string | null; account_number?: string | null; exchange_name?: string | null; account_label?: string | null; show_balance?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["trading_accounts"]["Insert"]>;
        Relationships: [];
      };
      admin_users: {
        Row: { user_id: string; username: string; email: string; created_at: string };
        Insert: { user_id: string; username: string; email: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_trader_registration: {
        Args: { p_user_id: string; p_full_name: string; p_alias: string; p_email: string; p_phone: string; p_region: string; p_social: string; p_account: Json; p_consent_at: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
    this.name = "SupabaseConfigurationError";
  }
}

type SupabaseClients = { auth: SupabaseClient<Database>; database: SupabaseClient<Database> };
let clients: SupabaseClients | undefined;

export function getSupabaseClients() {
  if (clients) return clients;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey || url.includes("your-project") || anonKey.startsWith("your-") || serviceRoleKey.startsWith("your-")) {
    throw new SupabaseConfigurationError();
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SupabaseConfigurationError();
  }
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && parsedUrl.hostname === "localhost")) {
    throw new SupabaseConfigurationError();
  }

  const authOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  clients = {
    auth: createClient<Database>(url, anonKey, authOptions),
    database: createClient<Database>(url, serviceRoleKey, authOptions)
  };
  return clients;
}
