/**
 * User config store — dashboard password, tunnel settings, port
 * JSON file at ~/.kiro-proxy/config.json
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let cache = null;

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

function loadRaw() {
  ensureDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {};
}

function saveData(data) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

export const userConfig = {
  /** Get full config object */
  get() {
    if (!cache) {
      cache = { ...DEFAULTS, ...loadRaw() };
    }
    return { ...cache };
  },

  /** Set a single key */
  set(key, value) {
    const current = loadRaw();
    current[key] = value;
    cache = { ...DEFAULTS, ...current };
    saveData(current);
  },

  /** Set multiple keys */
  setAll(updates) {
    const current = loadRaw();
    Object.assign(current, updates);
    cache = { ...DEFAULTS, ...current };
    saveData(current);
  },

  /** Reset to defaults */
  reset() {
    cache = { ...DEFAULTS };
    saveData({});
  },

  // ─── Password ─────────────────────────────────────
  hasPassword() {
    return !!this.get().passwordHash;
  },

  setPassword(plainPassword) {
    this.set("passwordHash", hashPassword(plainPassword));
  },

  verifyPassword(plainPassword) {
    const hash = this.get().passwordHash;
    if (!hash) return true; // no password set → allow
    return hash === hashPassword(plainPassword);
  },

  // ─── Tunnel ───────────────────────────────────────
  setTunnelInfo(url, pid) {
    this.setAll({ tunnelEnabled: true, tunnelUrl: url, tunnelProcessId: pid });
  },

  clearTunnelInfo() {
    this.setAll({ tunnelEnabled: false, tunnelUrl: null, tunnelProcessId: null });
  },

  setCustomDomain(domain) {
    this.set("customDomain", domain || null);
  },
};
