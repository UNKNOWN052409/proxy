/**
 * CLI shared library — reads/writes the same ~/.kiro-proxy/accounts.json
 * as the Next.js app, so both can run side by side.
 */

import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = path.join(os.homedir(), ".kiro-proxy");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAccounts() {
  ensureDir();
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

function loadUsage() {
  ensureDir();
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const raw = fs.readFileSync(USAGE_FILE, "utf-8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

export function getStatus() {
  const accounts = loadAccounts();
  const usage = loadUsage();

  // Top models
  const modelCounts = {};
  for (const u of usage) {
    modelCounts[u.model] = (modelCounts[u.model] || 0) + 1;
  }
  const sortedModels = Object.entries(modelCounts).sort(([, a], [, b]) => b - a);

  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter(a => a.active !== false).length,
    totalRequests: usage.length,
    recentModels: sortedModels,
    dataDir: DATA_DIR,
    accountsFile: ACCOUNTS_FILE,
  };
}

export function readAccounts() {
  return loadAccounts();
}

export function importAccounts(jsonData) {
  const accounts = loadAccounts();
  const list = Array.isArray(jsonData) ? jsonData : (jsonData.accounts || jsonData.connections || [jsonData]);

  let success = 0;
  let failed = 0;
  const results = [];

  for (const item of list) {
    try {
      const normalized = {
        id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email: item.email || null,
        accessToken: item.accessToken || item.token || null,
        refreshToken: item.refreshToken || null,
        provider: item.provider || "kiro",
        authType: item.authType || "oauth",
        source: "cli-import",
        active: item.active !== false,
        importedAt: new Date().toISOString(),
        label: item.label || item.email || null,
      };

      if (!normalized.accessToken && !normalized.refreshToken) {
        failed++;
        results.push({ ok: false, error: "No accessToken or refreshToken", index: results.length });
        continue;
      }

      // Check for duplicate by email
      const existingIdx = accounts.findIndex(
        a => normalized.email && a.email && a.email.toLowerCase() === normalized.email.toLowerCase()
      );
      if (existingIdx >= 0) {
        accounts[existingIdx] = { ...accounts[existingIdx], ...normalized, id: accounts[existingIdx].id };
      } else {
        accounts.push(normalized);
      }

      success++;
      results.push({ ok: true, id: normalized.id, email: normalized.email });
    } catch (err) {
      failed++;
      results.push({ ok: false, error: err.message, index: results.length });
    }
  }

  // Save
  ensureDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");

  return { success, failed, total: accounts.length, results };
}
