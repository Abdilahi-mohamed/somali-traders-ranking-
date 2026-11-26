import { MongoClient, MongoServerError, type Collection, type Document } from "mongodb";

export interface TraderProfileDocument extends Document {
  user_id: string;
  full_name: string;
  trading_alias: string;
  email: string;
  phone: string;
  region: string;
  social_profile: string;
  status: string;
  consent_at: string;
  created_at: string;
  password_hash: string;
}

export interface TradingAccountDocument extends Document {
  id: string;
  trader_id: string;
  account_type: string;
  account_category: string | null;
  prop_firm: string | null;
  platform: string | null;
  broker_name: string | null;
  server_name: string | null;
  account_number: string | null;
  account_currency: string | null;
  verification_status: string;
  verified_account_type: string | null;
  last_synced_at: string | null;
  connection_status: string;
  metaapi_account_id: string | null;
  ownership_verified: boolean | null;
  initial_balance: number | null;
  balance: number | null;
  equity: number | null;
  free_margin: number | null;
  used_margin: number | null;
  leverage: number | null;
  total_pnl: number | null;
  daily_pnl: number | null;
  weekly_pnl: number | null;
  monthly_pnl: number | null;
  yearly_pnl: number | null;
  total_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  win_rate: number | null;
  roi: number | null;
  maximum_drawdown: number | null;
  first_connected_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_error: string | null;
  exchange_name: string | null;
  account_label: string | null;
  show_balance: boolean;
  created_at: string;
}

export interface AdminUserDocument extends Document {
  user_id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
}

type MongoCollections = {
  trader_profiles: Collection<TraderProfileDocument>;
  trading_accounts: Collection<TradingAccountDocument>;
  trading_history: Collection<Document>;
  trading_open_positions: Collection<Document>;
  trading_account_snapshots: Collection<Document>;
  trading_account_verification_audit: Collection<Document>;
  admin_users: Collection<AdminUserDocument>;
};

let client: MongoClient | undefined;
let connecting: Promise<MongoCollections> | undefined;

export class MongoConfigurationError extends Error {
  constructor() {
    super("MongoDB is not configured. Set MONGODB_URI in backend/.env.");
    this.name = "MongoConfigurationError";
  }
}

export function isDuplicateKeyError(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError && error.code === 11000;
}

export function isDuplicateEmailKeyError(error: unknown) {
  return isDuplicateKeyError(error) && Boolean(error.keyPattern?.email);
}

export async function closeMongo() {
  const activeClient = client;
  client = undefined;
  connecting = undefined;
  await activeClient?.close();
}

export async function getMongoCollections(): Promise<MongoCollections> {
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri || uri.startsWith("mongodb://your-") || uri.startsWith("mongodb+srv://your-")) {
    throw new MongoConfigurationError();
  }
  const databaseName = process.env.MONGODB_DATABASE?.trim() || "somali_traders";

  connecting = (async () => {
    client = new MongoClient(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const database = client.db(databaseName);
    const collections: MongoCollections = {
      trader_profiles: database.collection<TraderProfileDocument>("trader_profiles"),
      trading_accounts: database.collection<TradingAccountDocument>("trading_accounts"),
      trading_history: database.collection("trading_history"),
      trading_open_positions: database.collection("trading_open_positions"),
      trading_account_snapshots: database.collection("trading_account_snapshots"),
      trading_account_verification_audit: database.collection("trading_account_verification_audit"),
      admin_users: database.collection<AdminUserDocument>("admin_users")
    };

    await Promise.all([
      collections.trader_profiles.createIndex({ user_id: 1 }, { unique: true }),
      collections.trader_profiles.createIndex({ email: 1 }, { unique: true, collation: { locale: "en", strength: 2 } }),
      collections.trading_accounts.createIndex({ id: 1 }, { unique: true }),
      collections.trading_accounts.createIndex(
        { platform: 1, broker_name: 1, server_name: 1, account_number: 1 },
        { name: "trading_accounts_mt_login_unique", unique: true, partialFilterExpression: { account_type: "forex" }, collation: { locale: "en", strength: 2 } }
      ),
      collections.trading_accounts.createIndex({ trader_id: 1 }),
      collections.trading_accounts.createIndex({ connection_status: 1, metaapi_account_id: 1 }),
      collections.trading_history.createIndex({ account_id: 1, deal_id: 1 }, { unique: true }),
      collections.trading_history.createIndex({ account_id: 1, deal_time: 1 }),
      collections.trading_open_positions.createIndex({ account_id: 1, opened_at: -1 }),
      collections.trading_open_positions.createIndex({ account_id: 1, position_id: 1 }, { unique: true }),
      collections.trading_account_snapshots.createIndex({ account_id: 1, snapshot_at: -1 }),
      collections.trading_account_verification_audit.createIndex({ account_id: 1, decided_at: -1 }),
      collections.admin_users.createIndex({ user_id: 1 }, { unique: true }),
      collections.admin_users.createIndex({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } }),
      collections.admin_users.createIndex({ email: 1 }, { unique: true, collation: { locale: "en", strength: 2 } })
    ]);

    return collections;
  })().catch((error: unknown) => {
    client?.close().catch((closeError: unknown) => {
      console.error("Could not close MongoDB after initialization failed.", {
        errorType: closeError instanceof Error ? closeError.name : "UnknownError"
      });
    });
    client = undefined;
    connecting = undefined;
    throw error;
  });
  return connecting;
}
