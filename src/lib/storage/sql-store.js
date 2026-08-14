import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import crypto from "crypto";
import { homedir } from "os";

const DATA_DIR = process.env.GATEWAY_DATA_DIR || join(/* turbopackIgnore: true */ homedir(), ".kiro-proxy");
const DB_PATH = process.env.GATEWAY_SQLITE_PATH || join(/* turbopackIgnore: true */ DATA_DIR, "gateway.db");

function ensureParent() {
  const parent = dirname(DB_PATH);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
}

function masterKey() {
  const raw = String(process.env.GATEWAY_CREDENTIAL_MASTER_KEY || "").trim();
  if (!raw) throw new Error("GATEWAY_CREDENTIAL_MASTER_KEY is required for encrypted credential storage");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("GATEWAY_CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return JSON.stringify({ algorithm: "aes-256-gcm", iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") });
}

export function decryptSecret(value) {
  if (!value) return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(parsed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}

export class SqlStore {
  constructor(path = DB_PATH) {
    this.path = path;
    ensureParent();
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
      );
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id TEXT PRIMARY KEY,
        email TEXT,
        provider TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'oauth',
        access_token TEXT,
        refresh_token TEXT,
        expires_at TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        active INTEGER NOT NULL DEFAULT 1,
        source TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
      CREATE INDEX IF NOT EXISTS idx_oauth_accounts_active ON oauth_accounts(active);
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        api_key_id INTEGER,
        owner_user_id INTEGER,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        timestamp TEXT NOT NULL,
        date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_key ON usage_events(api_key_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_owner ON usage_events(owner_user_id, timestamp);
      CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1');
    `);
  }

  get(namespace, key, fallback = null) {
    const row = this.db.prepare("SELECT value_json FROM kv_store WHERE namespace = ? AND key = ?").get(namespace, key);
    return row ? parseJson(row.value_json, fallback) : fallback;
  }

  set(namespace, key, value) {
    this.db.prepare(`
      INSERT INTO kv_store(namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(namespace, key, JSON.stringify(value), Date.now());
    return value;
  }

  setMany(namespace, entries) {
    const apply = () => {
      const stmt = this.db.prepare(`
        INSERT INTO kv_store(namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `);
      for (const [key, value] of Object.entries(entries || {})) stmt.run(namespace, key, JSON.stringify(value), Date.now());
    };
    return typeof this.db.transaction === "function" ? this.db.transaction(apply)() : apply();
  }

  delete(namespace, key) {
    return this.db.prepare("DELETE FROM kv_store WHERE namespace = ? AND key = ?").run(namespace, key).changes > 0;
  }

  namespace(namespace) {
    const rows = this.db.prepare("SELECT key, value_json FROM kv_store WHERE namespace = ?").all(namespace);
    return Object.fromEntries(rows.map((row) => [row.key, parseJson(row.value_json, null)]));
  }

  snapshot() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      kv: this.namespaceEntries(),
      accounts: this.db.prepare("SELECT id, email, provider, auth_type, expires_at, payload_json, active, source, created_at, updated_at FROM oauth_accounts ORDER BY created_at").all().map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })),
    };
  }

  namespaceEntries() {
    const rows = this.db.prepare("SELECT namespace, key, value_json FROM kv_store ORDER BY namespace, key").all();
    const result = {};
    for (const row of rows) (result[row.namespace] ||= {})[row.key] = parseJson(row.value_json, null);
    return result;
  }

  close() { this.db.close(); }
}

export const sqlStore = new SqlStore();
export { DB_PATH };
