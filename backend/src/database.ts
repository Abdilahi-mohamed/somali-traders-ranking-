import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const databasePath = config.databasePath === ":memory:"
  ? config.databasePath
  : isAbsolute(config.databasePath)
    ? config.databasePath
    : resolve(process.cwd(), config.databasePath);

if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

export const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS traders (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    trading_alias TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL,
    region TEXT NOT NULL,
    social_profile TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    consent_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_verification',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trading_accounts (
    id TEXT PRIMARY KEY,
    trader_id TEXT NOT NULL UNIQUE REFERENCES traders(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN ('forex', 'crypto')),
    account_category TEXT,
    prop_firm TEXT,
    platform TEXT,
    broker_name TEXT,
    server_name TEXT,
    account_number TEXT,
    exchange_name TEXT,
    account_label TEXT,
    show_balance INTEGER NOT NULL CHECK (show_balance IN (0, 1))
  );
`);
