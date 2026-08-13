import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "platform.db");
let db;

function database() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS platform_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS platform_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider_ids TEXT NOT NULL DEFAULT '[]',
      model_ids TEXT NOT NULL DEFAULT '[]',
      rpm_limit INTEGER NOT NULL DEFAULT 0,
      token_limit INTEGER NOT NULL DEFAULT 0,
      active_from TEXT,
      active_until TEXT,
      profile_slug TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id),
      FOREIGN KEY(user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS platform_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      hostname TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      verification_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      FOREIGN KEY(user_id) REFERENCES platform_users(id) ON DELETE SET NULL
    );
  `);
  for (const statement of [
    "ALTER TABLE platform_scopes ADD COLUMN rpm_limit INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE platform_scopes ADD COLUMN token_limit INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE platform_scopes ADD COLUMN active_from TEXT",
    "ALTER TABLE platform_scopes ADD COLUMN active_until TEXT",
    "ALTER TABLE platform_scopes ADD COLUMN profile_slug TEXT",
  ]) { try { db.exec(statement); } catch { /* existing column */ } }
  return db;
}

function hashPassword(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, role: row.role, active: Boolean(row.active), created_at: row.created_at, last_login_at: row.last_login_at };
}

export function ensureAdmin(email, password) {
  if (!email || !password) throw new Error("Admin email and password are required");
  const d = database();
  const existing = d.prepare("SELECT id FROM platform_users WHERE role='admin' LIMIT 1").get();
  if (existing) return false;
  const now = new Date().toISOString();
  const result = d.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?, 'admin', ?)").run(email.trim().toLowerCase(), hashPassword(password), now);
  d.prepare("INSERT INTO platform_scopes(user_id,provider_ids,model_ids,created_at,updated_at) VALUES(?, '[]','[]',?,?)").run(result.lastInsertRowid, now, now);
  return true;
}

export function createUser({ email, password, role = "user" }) {
  if (!email || !password) throw new Error("Email and password are required");
  if (!["admin", "user"].includes(role)) throw new Error("Invalid role");
  const d = database();
  const now = new Date().toISOString();
  const result = d.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").run(email.trim().toLowerCase(), hashPassword(password), role, now);
  d.prepare("INSERT INTO platform_scopes(user_id,provider_ids,model_ids,created_at,updated_at) VALUES(?, '[]','[]',?,?)").run(result.lastInsertRowid, now, now);
  return getUser(result.lastInsertRowid);
}

export function authenticateUser(email, password) {
  const d = database();
  const row = d.prepare("SELECT * FROM platform_users WHERE email=? AND active=1").get(String(email || "").trim().toLowerCase());
  if (!row || hashPassword(password) !== row.password_hash) return null;
  d.prepare("UPDATE platform_users SET last_login_at=? WHERE id=?").run(new Date().toISOString(), row.id);
  return safeUser({ ...row, last_login_at: new Date().toISOString() });
}

export function getUser(id) {
  return safeUser(database().prepare("SELECT * FROM platform_users WHERE id=?").get(id));
}

export function listUsers() {
  return database().prepare("SELECT id,email,role,active,created_at,last_login_at FROM platform_users ORDER BY created_at DESC").all().map(safeUser);
}

export function setUserActive(id, active) {
  database().prepare("UPDATE platform_users SET active=? WHERE id=?").run(active ? 1 : 0, id);
  return getUser(id);
}

export function setScope(userId, { providerIds = [], modelIds = [], rpmLimit = 0, tokenLimit = 0, activeFrom = null, activeUntil = null, profileSlug = null }) {
  const d = database();
  const now = new Date().toISOString();
  const providers = JSON.stringify([...new Set(providerIds.filter((v) => typeof v === "string" && v.length <= 200))]);
  const models = JSON.stringify([...new Set(modelIds.filter((v) => typeof v === "string" && v.length <= 200))]);
  const rpm = Math.max(0, Math.floor(Number(rpmLimit) || 0));
  const tokens = Math.max(0, Math.floor(Number(tokenLimit) || 0));
  const slug = String(profileSlug || `user-${userId}`).trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || `user-${userId}`;
  d.prepare(`INSERT INTO platform_scopes(user_id,provider_ids,model_ids,rpm_limit,token_limit,active_from,active_until,profile_slug,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET provider_ids=excluded.provider_ids, model_ids=excluded.model_ids, rpm_limit=excluded.rpm_limit, token_limit=excluded.token_limit, active_from=excluded.active_from, active_until=excluded.active_until, profile_slug=excluded.profile_slug, updated_at=excluded.updated_at`).run(userId, providers, models, rpm, tokens, activeFrom || null, activeUntil || null, slug, now, now);
  return getScope(userId);
}

export function getScope(userId) {
  const row = database().prepare("SELECT * FROM platform_scopes WHERE user_id=?").get(userId);
  if (!row) return { user_id: userId, provider_ids: [], model_ids: [], rpm_limit: 0, token_limit: 0, active_from: null, active_until: null, profile_slug: `user-${userId}` };
  return { user_id: row.user_id, provider_ids: JSON.parse(row.provider_ids), model_ids: JSON.parse(row.model_ids), rpm_limit: Number(row.rpm_limit || 0), token_limit: Number(row.token_limit || 0), active_from: row.active_from || null, active_until: row.active_until || null, profile_slug: row.profile_slug || `user-${userId}`, updated_at: row.updated_at };
}

export function canUse(scope, { providerId, modelId }) {
  const now = Date.now();
  const fromOk = !scope.active_from || now >= Date.parse(scope.active_from);
  const untilOk = !scope.active_until || now <= Date.parse(scope.active_until);
  const providerOk = !scope.provider_ids.length || scope.provider_ids.includes(providerId);
  const modelOk = !scope.model_ids.length || scope.model_ids.includes(modelId);
  return fromOk && untilOk && providerOk && modelOk;
}

export function connectDomain({ hostname, userId = null }) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalized)) throw new Error("Enter a valid domain name");
  const token = `gateway-verify-${crypto.randomBytes(18).toString("hex")}`;
  const now = new Date().toISOString();
  const d = database();
  d.prepare("INSERT INTO platform_domains(user_id,hostname,status,verification_token,created_at) VALUES(?,?, 'pending',?,?) ON CONFLICT(hostname) DO UPDATE SET user_id=excluded.user_id, status='pending', verification_token=excluded.verification_token").run(userId, normalized, token, now);
  return getDomain(normalized);
}

export function getDomain(hostname) {
  return database().prepare("SELECT id,user_id,hostname,status,verification_token,created_at,verified_at FROM platform_domains WHERE hostname=?").get(hostname) || null;
}

export function listDomains() {
  return database().prepare("SELECT id,user_id,hostname,status,created_at,verified_at FROM platform_domains ORDER BY created_at DESC").all();
}
