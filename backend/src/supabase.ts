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
        Row: { id: string; trader_id: string; account_type: string; account_category: string | null; prop_firm: string | null; platform: string | null; broker_name: string | null; server_name: string | null; account_number: string | null; account_currency: string | null; verification_status: string; verified_account_type: string | null; last_synced_at: string | null; connection_status: string; metaapi_account_id: string | null; ownership_verified: boolean | null; initial_balance: number | null; balance: number | null; equity: number | null; free_margin: number | null; used_margin: number | null; leverage: number | null; total_pnl: number | null; daily_pnl: number | null; weekly_pnl: number | null; monthly_pnl: number | null; yearly_pnl: number | null; total_trades: number | null; winning_trades: number | null; losing_trades: number | null; win_rate: number | null; roi: number | null; maximum_drawdown: number | null; first_connected_at: string | null; last_successful_sync_at: string | null; last_sync_error: string | null; exchange_name: string | null; account_label: string | null; show_balance: boolean; created_at: string };
        Insert: { id?: string; trader_id: string; account_type: string; account_category?: string | null; prop_firm?: string | null; platform?: string | null; broker_name?: string | null; server_name?: string | null; account_number?: string | null; account_currency?: string | null; verification_status?: string; verified_account_type?: string | null; last_synced_at?: string | null; connection_status?: string; metaapi_account_id?: string | null; ownership_verified?: boolean | null; initial_balance?: number | null; balance?: number | null; equity?: number | null; free_margin?: number | null; used_margin?: number | null; leverage?: number | null; total_pnl?: number | null; daily_pnl?: number | null; weekly_pnl?: number | null; monthly_pnl?: number | null; yearly_pnl?: number | null; total_trades?: number | null; winning_trades?: number | null; losing_trades?: number | null; win_rate?: number | null; roi?: number | null; maximum_drawdown?: number | null; first_connected_at?: string | null; last_successful_sync_at?: string | null; last_sync_error?: string | null; exchange_name?: string | null; account_label?: string | null; show_balance?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["trading_accounts"]["Insert"]>;
        Relationships: [];
      };
      trading_history: {
        Row: { id: string; account_id: string; deal_id: string; position_id: string | null; deal_time: string; deal_type: string; entry_type: string | null; symbol: string | null; volume: number | null; price: number | null; profit: number; commission: number; swap: number; fee: number; created_at: string };
        Insert: { id?: string; account_id: string; deal_id: string; position_id?: string | null; deal_time: string; deal_type: string; entry_type?: string | null; symbol?: string | null; volume?: number | null; price?: number | null; profit?: number; commission?: number; swap?: number; fee?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["trading_history"]["Insert"]>;
        Relationships: [];
      };
      trading_open_positions: {
        Row: { id: string; account_id: string; position_id: string; position_type: string; symbol: string; volume: number; opened_at: string; open_price: number; current_price: number | null; profit: number | null; swap: number | null; stop_loss: number | null; take_profit: number | null; last_synchronized_at: string };
        Insert: { id?: string; account_id: string; position_id: string; position_type: string; symbol: string; volume: number; opened_at: string; open_price: number; current_price?: number | null; profit?: number | null; swap?: number | null; stop_loss?: number | null; take_profit?: number | null; last_synchronized_at?: string };
        Update: Partial<Database["public"]["Tables"]["trading_open_positions"]["Insert"]>;
        Relationships: [];
      };
      trading_account_snapshots: {
        Row: { id: string; account_id: string; snapshot_at: string; account_type: string | null; currency: string | null; balance: number | null; equity: number | null; free_margin: number | null; used_margin: number | null; leverage: number | null; total_pnl: number | null; daily_pnl: number | null; weekly_pnl: number | null; monthly_pnl: number | null; yearly_pnl: number | null; total_trades: number | null; winning_trades: number | null; losing_trades: number | null; win_rate: number | null; roi: number | null; maximum_drawdown: number | null };
        Insert: { id?: string; account_id: string; snapshot_at?: string; account_type?: string | null; currency?: string | null; balance?: number | null; equity?: number | null; free_margin?: number | null; used_margin?: number | null; leverage?: number | null; total_pnl?: number | null; daily_pnl?: number | null; weekly_pnl?: number | null; monthly_pnl?: number | null; yearly_pnl?: number | null; total_trades?: number | null; winning_trades?: number | null; losing_trades?: number | null; win_rate?: number | null; roi?: number | null; maximum_drawdown?: number | null };
        Update: Partial<Database["public"]["Tables"]["trading_account_snapshots"]["Insert"]>;
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
