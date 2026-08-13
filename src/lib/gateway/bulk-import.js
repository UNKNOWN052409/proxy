import { importEncryptedCredentials } from "./credentials.js";
import { accountStore } from "../kiro/store.js";

export const MAX_BULK_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_BULK_IMPORT_ENTRIES = 500;

const FORBIDDEN_FIELD_NAMES = new Set([
  "password", "passwordhash", "cookie", "cookies", "session", "sessiontoken",
  "headers", "authorization", "proxyauthorization", "privatekey",
]);

function normalizedFieldName(value) {
  return String(value || "").replace(/[_-]/g, "").toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, maxLength = 4096) {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized)) return "";
  return normalized;
}

function normalizeProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) throw new Error("Each credential or account requires a valid provider ID");
  return id;
}

function scanForbidden(value, path = "entry", violations = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`, violations));
    return violations;
  }
  if (!isPlainObject(value)) return violations;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_NAMES.has(normalizedFieldName(key))) violations.push(`${path}.${key}`);
    scanForbidden(nested, `${path}.${key}`, violations);
  }
  return violations;
}

function field(entry, ...names) {
  for (const name of names) {
    if (entry?.[name] !== undefined && entry?.[name] !== null) return entry[name];
  }
  return null;
}

function compactError(error) {
  return String(error?.message || "Invalid entry").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function normalizeCredential(entry, defaultProviderId) {
  const object = typeof entry === "string" ? { token: entry } : entry;
  if (!isPlainObject(object)) throw new Error("Credential entries must be an object or token string");
  const providerId = normalizeProviderId(field(object, "providerId", "provider", "service") || defaultProviderId);
  const apiKey = safeString(field(object, "apiKey", "api_key", "key"));
  const token = safeString(field(object, "token", "bearerToken", "bearer_token"));
  if (!apiKey && !token) throw new Error("Credential needs apiKey, key, or token");
  return {
    providerId,
    entry: {
      ...(apiKey ? { apiKey } : { token }),
      ...(safeString(object.refreshToken || object.refresh_token) ? { refreshToken: safeString(object.refreshToken || object.refresh_token) } : {}),
      ...(safeString(object.label, 120) ? { label: safeString(object.label, 120) } : {}),
      ...(object.expiresAt || object.expires_at ? { expiresAt: object.expiresAt || object.expires_at } : {}),
    },
  };
}

function normalizeAccount(entry, defaultProviderId) {
  if (!isPlainObject(entry)) throw new Error("Account entries must be objects");
  const auth = isPlainObject(entry.cliProxyAuth) ? entry.cliProxyAuth : entry;
  const provider = normalizeProviderId(field(auth, "provider", "providerId", "service") || field(entry, "provider", "providerId", "service") || defaultProviderId);
  const accessToken = safeString(field(auth, "accessToken", "access_token"));
  const refreshToken = safeString(field(auth, "refreshToken", "refresh_token"));
  if (!accessToken && !refreshToken) throw new Error("Account needs accessToken or refreshToken");
  const providerSpecificData = isPlainObject(entry.providerSpecificData) ? entry.providerSpecificData : {};
  return {
    provider,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    ...(safeString(auth.email || entry.email, 320) ? { email: safeString(auth.email || entry.email, 320) } : {}),
    ...(safeString(entry.label || auth.label, 120) ? { label: safeString(entry.label || auth.label, 120) } : {}),
    ...(safeString(auth.authType || entry.authType, 64) ? { authType: safeString(auth.authType || entry.authType, 64) } : {}),
    ...(auth.expiresAt || auth.expires_at || entry.expiresAt || entry.expires_at ? { expiresAt: auth.expiresAt || auth.expires_at || entry.expiresAt || entry.expires_at } : {}),
    ...(entry.active === false ? { active: false } : {}),
    providerSpecificData,
  };
}

function addEntry(plan, rawEntry, defaultProviderId, index, hint = "auto") {
  const forbidden = scanForbidden(rawEntry);
  if (forbidden.length) {
    plan.rejected.push({ index, kind: hint, error: "Passwords, cookies, browser sessions, private headers, and authorization-header dumps are not accepted" });
    return;
  }
  try {
    const nestedAuth = isPlainObject(rawEntry?.cliProxyAuth) ? rawEntry.cliProxyAuth : rawEntry;
    const isAccount = hint === "account" || (isPlainObject(rawEntry) && Boolean(field(nestedAuth, "accessToken", "access_token", "refreshToken", "refresh_token")));
    if (isAccount) plan.accounts.push(normalizeAccount(rawEntry, defaultProviderId));
    else plan.credentials.push(normalizeCredential(rawEntry, defaultProviderId));
  } catch (error) {
    plan.rejected.push({ index, kind: hint, error: compactError(error) });
  }
}

function parseJsonPayload(payload, defaultProviderId) {
  const plan = { credentials: [], accounts: [], rejected: [] };
  const root = isPlainObject(payload) && isPlainObject(payload.data) ? { ...payload.data, provider: payload.provider || payload.providerId || payload.data.provider || payload.data.providerId } : payload;
  const inheritedProvider = isPlainObject(root) ? field(root, "provider", "providerId", "service") || defaultProviderId : defaultProviderId;
  const credentialLists = isPlainObject(root)
    ? [root.credentials, root.tokens, root.apiKeys, root.api_keys].filter(Array.isArray)
    : [];
  const accountLists = isPlainObject(root)
    ? [root.accounts, root.connections].filter(Array.isArray)
    : [];

  if (Array.isArray(root)) {
    root.forEach((entry, index) => addEntry(plan, entry, inheritedProvider, index));
  } else if (credentialLists.length || accountLists.length) {
    let index = 0;
    for (const list of credentialLists) for (const entry of list) addEntry(plan, entry, inheritedProvider, index++, "credential");
    for (const list of accountLists) for (const entry of list) addEntry(plan, entry, inheritedProvider, index++, "account");
  } else if (isPlainObject(root)) {
    addEntry(plan, root, inheritedProvider, 0);
  } else {
    throw new Error("Import JSON must contain credential or account entries");
  }
  return plan;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (quoted) throw new Error("CSV contains an unmatched quote");
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  const nonempty = rows.filter((record) => record.some((value) => value));
  if (nonempty.length < 2) throw new Error("CSV needs a header and at least one entry");
  const headers = nonempty[0].map((value) => value.trim());
  if (!headers.some((header) => ["provider", "providerId", "service"].includes(header))) throw new Error("CSV needs a provider, providerId, or service column");
  return nonempty.slice(1).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

function parseTokenList(text, defaultProviderId) {
  if (!defaultProviderId) throw new Error("A provider ID is required for a plain token-list file");
  return text.split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith("#"))
    .map((token) => ({ provider: defaultProviderId, token }));
}

export function parseAuthorizedImportText(text, { fileName = "", providerId = "", format = "auto" } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_BULK_IMPORT_BYTES) throw new Error("Import file exceeds 5 MB");
  const selectedFormat = String(format || "auto").toLowerCase();
  const inferred = selectedFormat === "auto"
    ? (/\.csv$/i.test(fileName) ? "csv" : /\.txt$/i.test(fileName) ? "tokens" : "json")
    : selectedFormat;
  let plan;
  if (inferred === "csv") plan = parseJsonPayload(parseCsv(text), providerId);
  else if (inferred === "tokens" || inferred === "txt") plan = parseJsonPayload(parseTokenList(text, providerId), providerId);
  else {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("JSON import file is invalid"); }
    plan = parseJsonPayload(parsed, providerId);
  }
  if (plan.credentials.length + plan.accounts.length > MAX_BULK_IMPORT_ENTRIES) throw new Error(`At most ${MAX_BULK_IMPORT_ENTRIES} entries may be imported at once`);
  if (!plan.credentials.length && !plan.accounts.length) throw new Error(plan.rejected[0]?.error || "No eligible API keys, official tokens, or account records were found");
  return plan;
}

export function summarizeAuthorizedImport(plan) {
  const credentialProviders = [...new Set((plan?.credentials || []).map((entry) => entry.providerId))];
  const accountProviders = [...new Set((plan?.accounts || []).map((entry) => entry.provider))];
  return {
    credentialEntries: plan?.credentials?.length || 0,
    accountEntries: plan?.accounts?.length || 0,
    rejectedEntries: plan?.rejected?.length || 0,
    credentialProviders,
    accountProviders,
  };
}

export function importAuthorizedBulkPlan(plan, { source = "authorized-file-import", credentialImporter = importEncryptedCredentials, accountImporter = accountStore.bulkImport.bind(accountStore) } = {}) {
  const credentialResults = [];
  const grouped = new Map();
  for (const item of plan.credentials || []) grouped.set(item.providerId, [...(grouped.get(item.providerId) || []), item.entry]);
  for (const [providerId, entries] of grouped) {
    try {
      const imported = credentialImporter(providerId, entries);
      credentialResults.push({ providerId, imported: imported.length, failed: 0, credentials: imported });
    } catch (error) {
      credentialResults.push({ providerId, imported: 0, failed: entries.length, error: compactError(error) });
    }
  }
  const accountResult = (plan.accounts || []).length ? accountImporter(plan.accounts, source) : { success: 0, failed: 0, results: [] };
  const importedCredentials = credentialResults.reduce((total, result) => total + result.imported, 0);
  const failedCredentials = credentialResults.reduce((total, result) => total + result.failed, 0);
  const rejected = plan.rejected || [];
  return {
    success: failedCredentials === 0 && accountResult.failed === 0 && rejected.length === 0,
    imported: importedCredentials + accountResult.success,
    failed: failedCredentials + accountResult.failed + rejected.length,
    credentials: { imported: importedCredentials, failed: failedCredentials, providers: credentialResults },
    accounts: { imported: accountResult.success, failed: accountResult.failed, results: accountResult.results || [] },
    rejected,
    storage: { credentials: "aes-256-gcm encrypted credential pool", accounts: "aes-256-gcm encrypted SQLite" },
  };
}

export const __testables = { parseCsv, parseJsonPayload, normalizeCredential, normalizeAccount, scanForbidden };
