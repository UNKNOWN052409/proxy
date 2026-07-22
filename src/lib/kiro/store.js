/**
 * Persistent file-backed account store.
 * Saves to ~/.kiro-proxy/accounts.json on every mutation.
 * Loads on startup. Accumulative — never clears on import.
 */

import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let accounts = [];
let loaded = false;

function load() {
  if (loaded) return;
  ensureDir();
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      accounts = JSON.parse(raw);
      if (!Array.isArray(accounts)) accounts = [];
    }
  } catch (err) {
    console.error("Failed to load accounts:", err.message);
    accounts = [];
  }
  loaded = true;
}

function save() {
  ensureDir();
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save accounts:", err.message);
  }
}

// Load immediately
load();

export const accountStore = {
  getAll() {
    return [...accounts];
  },

  getActive() {
    return accounts.filter(a => {
      if (!a.active) return false;
      if (a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
      return true;
    });
  },

  add(account) {
    load();
    const existing = accounts.findIndex(
      a => a.email && account.email && a.email.toLowerCase() === account.email.toLowerCase()
    );

    const entry = {
      id: uuidv4(),
      email: account.email || null,
      provider: account.provider || "kiro",
      authType: account.authType || "oauth",
      accessToken: account.accessToken || null,
      refreshToken: account.refreshToken || null,
      expiresAt: account.expiresAt || null,
      providerSpecificData: account.providerSpecificData || {},
      testStatus: account.testStatus || "unknown",
      active: account.active !== false,
      importedAt: new Date().toISOString(),
      source: account.source || "manual",
      label: account.label || account.email || `Account ${accounts.length + 1}`,
    };

    if (existing >= 0) {
      accounts[existing] = { ...accounts[existing], ...entry, id: accounts[existing].id };
      if (account.label) accounts[existing].label = account.label;
    } else {
      accounts.push(entry);
    }

    save();
    return entry;
  },

  bulkImport(accountList, source = "import") {
    load();
    const results = [];
    let success = 0;
    let failed = 0;

    for (const acct of accountList) {
      try {
        if (!acct.accessToken && !acct.refreshToken) {
          failed++;
          results.push({ ok: false, error: "No accessToken or refreshToken", index: results.length });
          continue;
        }
        const entry = this.add({ ...acct, source });
        success++;
        results.push({ ok: true, id: entry.id, email: entry.email });
      } catch (err) {
        failed++;
        results.push({ ok: false, error: err.message, index: results.length });
      }
    }

    return { success, failed, results };
  },

  importFromProxy(json, source = "unknown") {
    let list = Array.isArray(json) ? json : (json.accounts || json.connections || [json]);
    if (!Array.isArray(list)) list = [json];

    const normalized = list.map(item => {
      if (item.accessToken || item.refreshToken) {
        return {
          accessToken: item.accessToken || null,
          refreshToken: item.refreshToken || null,
          email: item.email || null,
          provider: item.provider || "kiro",
          providerSpecificData: item.providerSpecificData || {},
          testStatus: item.testStatus || "active",
          authType: item.authType || "oauth",
          source,
          label: item.label || item.email || null,
        };
      }
      if (item.cliProxyAuth) {
        const auth = item.cliProxyAuth;
        return {
          accessToken: auth.accessToken || null,
          refreshToken: auth.refreshToken || null,
          email: auth.email || null,
          provider: "kiro",
          providerSpecificData: auth.providerSpecificData || {},
          authType: "oauth",
          source,
          label: item.label || auth.email || null,
        };
      }
      return {
        accessToken: item.accessToken || item.token || null,
        refreshToken: item.refreshToken || null,
        email: item.email || null,
        provider: item.provider || "kiro",
        providerSpecificData: item.providerSpecificData || {},
        authType: "oauth",
        source,
        label: item.label || item.email || null,
      };
    }).filter(a => a.accessToken || a.refreshToken);

    return this.bulkImport(normalized, source);
  },

  remove(id) {
    load();
    const before = accounts.length;
    accounts = accounts.filter(a => a.id !== id);
    if (accounts.length !== before) { save(); return true; }
    return false;
  },

  update(id, data) {
    load();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], ...data };
      save();
      return accounts[idx];
    }
    return null;
  },

  exportJson() {
    load();
    return {
      exportedAt: new Date().toISOString(),
      source: "kiro-proxy",
      totalAccounts: accounts.length,
      accounts: accounts.map(a => ({
        email: a.email,
        provider: a.provider,
        authType: a.authType,
        accessToken: a.accessToken,
        refreshToken: a.refreshToken,
        providerSpecificData: a.providerSpecificData,
        label: a.label,
      })),
    };
  },

  exportFormat9Router() {
    load();
    return accounts.map(a => ({
      accessToken: a.accessToken,
      refreshToken: a.refreshToken,
      email: a.email,
      providerSpecificData: a.providerSpecificData,
    }));
  },

  _clear() {
    load();
    accounts = [];
    save();
  },
};
