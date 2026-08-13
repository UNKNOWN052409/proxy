/**
 * Durable provider-account store backed by the shared SQLite database.
 * Only explicitly supplied API/OAuth credentials are accepted; browser/session
 * material is rejected by importFromProxy before it reaches storage.
 */
import { randomUUID } from "crypto";
import { sqlStore, encryptSecret, decryptSecret } from "../storage/sql-store.js";

const db = sqlStore.db;

function rowToAccount(row) {
  const payload = (() => { try { return JSON.parse(row.payload_json || "{}"); } catch { return {}; } })();
  return {
    id: row.id,
    email: row.email || null,
    provider: row.provider,
    authType: row.auth_type || "oauth",
    accessToken: row.access_token ? decryptSecret(row.access_token) : null,
    refreshToken: row.refresh_token ? decryptSecret(row.refresh_token) : null,
    expiresAt: row.expires_at || null,
    ...payload,
    active: Boolean(row.active),
    importedAt: payload.importedAt || new Date(row.created_at).toISOString(),
    source: row.source || payload.source || "manual",
    label: payload.label || row.email || `Account ${row.id.slice(0, 8)}`,
  };
}

function safePayload(account) {
  const payload = { ...account };
  delete payload.id; delete payload.email; delete payload.provider; delete payload.authType;
  delete payload.accessToken; delete payload.refreshToken; delete payload.expiresAt;
  delete payload.active; delete payload.source; delete payload.label; delete payload.importedAt;
  return payload;
}

function rows() {
  return db.prepare("SELECT * FROM oauth_accounts ORDER BY created_at DESC").all().map(rowToAccount);
}

function upsert(account, existingId = null) {
  const now = Date.now();
  const id = existingId || randomUUID();
  db.prepare(`
    INSERT INTO oauth_accounts (id, email, provider, auth_type, access_token, refresh_token, expires_at, payload_json, active, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email=excluded.email, provider=excluded.provider, auth_type=excluded.auth_type,
      access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
      payload_json=excluded.payload_json, active=excluded.active, source=excluded.source, updated_at=excluded.updated_at
  `).run(id, account.email || null, account.provider || "kiro", account.authType || "oauth", account.accessToken ? encryptSecret(account.accessToken) : null,
    account.refreshToken ? encryptSecret(account.refreshToken) : null, account.expiresAt || null, JSON.stringify(safePayload(account)), account.active === false ? 0 : 1,
    account.source || "manual", now, now);
  return rowToAccount(db.prepare("SELECT * FROM oauth_accounts WHERE id = ?").get(id));
}

function rejectUnsafe(item) {
  return ["password", "cookie", "cookies", "session", "sessionToken", "headers"].some((key) => item?.[key]);
}

export const accountStore = {
  getAll() { return rows(); },
  getById(id) { const row = db.prepare("SELECT * FROM oauth_accounts WHERE id = ?").get(id); return row ? rowToAccount(row) : null; },
  getActive() { return rows().filter((a) => a.active && (!a.expiresAt || Date.parse(a.expiresAt) > Date.now())); },
  add(account) {
    const existing = account.email ? rows().find((a) => a.email && a.email.toLowerCase() === account.email.toLowerCase() && a.provider === (account.provider || "kiro")) : null;
    return upsert({ ...account, importedAt: new Date().toISOString() }, existing?.id || null);
  },
  bulkImport(accountList, source = "import") {
    const results = []; let success = 0; let failed = 0;
    for (const acct of Array.isArray(accountList) ? accountList : []) {
      try {
        if (rejectUnsafe(acct) || (!acct.accessToken && !acct.refreshToken)) throw new Error("Explicit accessToken or refreshToken is required; cookies, sessions, passwords, and private headers are not accepted");
        const entry = this.add({ ...acct, source }); success++; results.push({ ok: true, id: entry.id, email: entry.email });
      } catch (error) { failed++; results.push({ ok: false, error: error.message, index: results.length }); }
    }
    return { success, failed, results };
  },
  importFromProxy(json, source = "authorized-token-import") {
    const list = Array.isArray(json) ? json : (json?.accounts || json?.connections || [json]);
    const normalized = (Array.isArray(list) ? list : [list]).filter(Boolean).map((item) => {
      if (rejectUnsafe(item)) return null;
      const auth = item.cliProxyAuth || item;
      if (!auth.accessToken && !auth.refreshToken) return null;
      return { accessToken: auth.accessToken || null, refreshToken: auth.refreshToken || null, email: auth.email || item.email || null,
        provider: auth.provider || item.provider || "kiro", providerSpecificData: auth.providerSpecificData || item.providerSpecificData || {},
        authType: auth.authType || item.authType || "oauth", label: item.label || auth.email || null };
    }).filter(Boolean);
    return this.bulkImport(normalized, source);
  },
  remove(id) { return db.prepare("DELETE FROM oauth_accounts WHERE id = ?").run(id).changes > 0; },
  update(id, data) { return this.getById(id) ? upsert({ ...this.getById(id), ...data }, id) : null; },
  exportJson() { const accounts = rows().map(({ accessToken, refreshToken, ...a }) => a); return { exportedAt: new Date().toISOString(), source: "kiro-proxy-sqlite", totalAccounts: accounts.length, accounts }; },
  exportFormat9Router() { return rows().map(({ accessToken, refreshToken, email, providerSpecificData }) => ({ accessToken, refreshToken, email, providerSpecificData })); },
  _clear() { db.prepare("DELETE FROM oauth_accounts").run(); },
};
