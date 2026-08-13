/**
 * Durable dashboard configuration store backed by SQLite.
 * Existing ~/.kiro-proxy/config.json is migrated once and retained as a backup.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { sqlStore } from "../storage/sql-store.js";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const NAMESPACE = "config";

const DEFAULTS = {
  passwordHash: null,
  tunnelEnabled: false,
  tunnelUrl: null,
  tunnelProcessId: null,
  customDomain: null,
  tunnelProvider: null,
  tunnelMode: null,
  tunnelStatus: "stopped",
  tunnelLastCheckAt: null,
  tunnelLastError: null,
  port: 20127,
};

let cache = null;
let migrated = false;

function ensureMigrated() {
  if (migrated) return;
  const existing = sqlStore.namespace(NAMESPACE);
  if (Object.keys(existing).length === 0 && fs.existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (parsed && typeof parsed === "object") sqlStore.setMany(NAMESPACE, parsed);
    } catch { /* invalid legacy config is ignored safely */ }
  }
  migrated = true;
}

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

export const userConfig = {
  get() {
    ensureMigrated();
    if (!cache) cache = { ...DEFAULTS, ...sqlStore.namespace(NAMESPACE) };
    return { ...cache };
  },
  set(key, value) {
    ensureMigrated();
    sqlStore.set(NAMESPACE, key, value);
    cache = { ...this.get(), [key]: value };
  },
  setAll(updates) {
    ensureMigrated();
    sqlStore.setMany(NAMESPACE, updates);
    cache = { ...this.get(), ...updates };
  },
  reset() {
    ensureMigrated();
    for (const key of Object.keys(sqlStore.namespace(NAMESPACE))) sqlStore.delete(NAMESPACE, key);
    cache = { ...DEFAULTS };
  },
  hasPassword() { return !!this.get().passwordHash; },
  setPassword(plainPassword) { this.set("passwordHash", hashPassword(plainPassword)); },
  verifyPassword(plainPassword) {
    const hash = this.get().passwordHash;
    if (!hash) return true;
    return hash === hashPassword(plainPassword);
  },
  setTunnelInfo(url, pid) { this.setAll({ tunnelEnabled: true, tunnelUrl: url, tunnelProcessId: pid }); },
  clearTunnelInfo() { this.setAll({ tunnelEnabled: false, tunnelUrl: null, tunnelProcessId: null }); },
  setCustomDomain(domain) { this.set("customDomain", domain || null); },
};
