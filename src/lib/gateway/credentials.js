import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "gateway-credentials.enc.json");
const ALGORITHM = "aes-256-gcm";
const MAX_CREDENTIALS_PER_PROVIDER = 20;
const COOLDOWN_MS = 60_000;

function masterKey() {
  const raw = String(process.env.GATEWAY_CREDENTIAL_MASTER_KEY || "").trim();
  if (!raw) throw new Error("GATEWAY_CREDENTIAL_MASTER_KEY is required for encrypted credential import");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("GATEWAY_CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes");
  return key;
}

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return { version: 1, credentials: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return parsed && typeof parsed === "object" && parsed.credentials && typeof parsed.credentials === "object"
      ? parsed
      : { version: 1, credentials: {} };
  } catch {
    throw new Error("Encrypted gateway credential store is unreadable");
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.chmodSync(tempPath, 0o600);
  fs.renameSync(tempPath, STORE_PATH);
}

function encrypt(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decrypt(value) {
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey(), Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) throw new Error("A valid providerId is required");
  return id;
}

function normalizeCredential(entry, providerId) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Credential entries must be objects");
  const secret = String(entry.apiKey || entry.token || "").trim();
  const refreshToken = String(entry.refreshToken || "").trim();
  if (!secret || secret.length > 4096 || /[\r\n]/.test(secret)) throw new Error("Each credential must contain one bounded API key or token");
  if (refreshToken && (refreshToken.length > 4096 || /[\r\n]/.test(refreshToken))) throw new Error("OAuth refresh token is invalid or too large");
  const label = String(entry.label || "credential").trim().slice(0, 120) || "credential";
  const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null;
  return {
    id: crypto.randomUUID(),
    providerId,
    label,
    encrypted: encrypt(secret),
    refreshEncrypted: refreshToken ? encrypt(refreshToken) : null,
    createdAt: new Date().toISOString(),
    expiresAt,
    failureCount: 0,
    cooldownUntil: null,
    lastUsedAt: null,
    disabled: false,
  };
}

export function importEncryptedCredentials(providerIdValue, entries) {
  const providerId = normalizeProviderId(providerIdValue);
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length || list.length > MAX_CREDENTIALS_PER_PROVIDER) throw new Error(`Provide between 1 and ${MAX_CREDENTIALS_PER_PROVIDER} credentials`);
  const store = readStore();
  const existing = Array.isArray(store.credentials[providerId]) ? store.credentials[providerId] : [];
  if (existing.length + list.length > MAX_CREDENTIALS_PER_PROVIDER) throw new Error(`Provider ${providerId} cannot exceed ${MAX_CREDENTIALS_PER_PROVIDER} credentials`);
  const added = list.map((entry) => normalizeCredential(entry, providerId));
  store.credentials[providerId] = [...existing, ...added];
  writeStore(store);
  return added.map(({ id, providerId: idProvider, label, createdAt, expiresAt }) => ({ id, providerId: idProvider, label, createdAt, expiresAt }));
}

export function listCredentialMetadata(providerIdValue) {
  const providerId = normalizeProviderId(providerIdValue);
  return (readStore().credentials[providerId] || []).map(({ id, providerId: idProvider, label, createdAt, expiresAt, failureCount, cooldownUntil, lastUsedAt, lastSuccessAt, lastFailureAt, lastStatusCode, authRejectedAt, verification, disabled }) => ({ id, providerId: idProvider, label, createdAt, expiresAt, failureCount, cooldownUntil, lastUsedAt, disabled: disabled === true, authRejectedAt: authRejectedAt || null, lastSuccessAt: lastSuccessAt || null, lastFailureAt: lastFailureAt || null, lastStatusCode: lastStatusCode || null, verification: verification || null }));
}

export function getCredentialForVerification(providerIdValue, credentialId) {
  const providerId = normalizeProviderId(providerIdValue);
  const id = String(credentialId || '').trim();
  if (!id) throw new Error('credentialId is required');
  const entry = (readStore().credentials[providerId] || []).find((candidate) => candidate.id === id);
  if (!entry) return null;
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) return { credentialId: entry.id, apiKey: decrypt(entry.encrypted), refreshToken: entry.refreshEncrypted ? decrypt(entry.refreshEncrypted) : null, expiresAt: entry.expiresAt, expired: true };
  return { credentialId: entry.id, apiKey: decrypt(entry.encrypted), refreshToken: entry.refreshEncrypted ? decrypt(entry.refreshEncrypted) : null, expiresAt: entry.expiresAt || null, expired: false };
}

export function recordCredentialVerification(providerIdValue, credentialId, verification) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const entries = store.credentials[providerId] || [];
  const safe = verification && typeof verification === 'object' ? {
    checkedAt: String(verification.checkedAt || new Date().toISOString()),
    status: String(verification.status || 'unknown').slice(0, 40),
    authenticityScore: Number.isFinite(Number(verification.authenticityScore)) ? Number(verification.authenticityScore) : null,
    ttftMs: Number.isFinite(Number(verification.ttftMs)) ? Number(verification.ttftMs) : null,
    model: verification.model ? String(verification.model).slice(0, 160) : null,
    error: verification.error ? String(verification.error).slice(0, 240) : null,
  } : null;
  let found = false;
  store.credentials[providerId] = entries.map((entry) => {
    if (entry.id !== credentialId) return entry;
    found = true;
    const verified = safe?.status === "verified";
    return { ...entry, verification: safe, ...(verified ? { authRejectedAt: null, failureCount: 0, cooldownUntil: null } : {}) };
  });
  if (found) writeStore(store);
  return found;
}

export function selectCredential(providerIdValue) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const now = Date.now();
  const candidates = (store.credentials[providerId] || []).filter((entry) => {
    if (entry.disabled === true) return false;
    if (entry.authRejectedAt) return false;
    if (entry.verification?.status === "quarantined" || entry.verification?.authenticityStatus === "quarantined") return false;
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= now) return false;
    return !entry.cooldownUntil || Date.parse(entry.cooldownUntil) <= now;
  });
  candidates.sort((a, b) => Date.parse(a.lastUsedAt || a.createdAt) - Date.parse(b.lastUsedAt || b.createdAt));
  const selected = candidates[0];
  if (!selected) return null;
  selected.lastUsedAt = new Date().toISOString();
  store.credentials[providerId] = store.credentials[providerId].map((entry) => entry.id === selected.id ? selected : entry);
  writeStore(store);
  return { credentialId: selected.id, apiKey: decrypt(selected.encrypted), refreshToken: selected.refreshEncrypted ? decrypt(selected.refreshEncrypted) : null, expiresAt: selected.expiresAt || null };
}

export function updateCredentialTokens(providerIdValue, credentialId, { apiKey, refreshToken, expiresAt } = {}) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const entries = store.credentials[providerId] || [];
  store.credentials[providerId] = entries.map((entry) => {
    if (entry.id !== credentialId) return entry;
    const next = { ...entry };
    if (apiKey) next.encrypted = encrypt(String(apiKey).trim());
    if (refreshToken) next.refreshEncrypted = encrypt(String(refreshToken).trim());
    if (expiresAt) next.expiresAt = new Date(expiresAt).toISOString();
    next.failureCount = 0;
    next.cooldownUntil = null;
    return next;
  });
  writeStore(store);
  return true;
}

export function setCredentialEnabled(providerIdValue, credentialId, enabled = true) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const entries = store.credentials[providerId] || [];
  let found = false;
  store.credentials[providerId] = entries.map((entry) => {
    if (entry.id !== credentialId) return entry;
    found = true;
    return { ...entry, disabled: enabled !== true };
  });
  if (found) writeStore(store);
  return found;
}

export function markCredentialResult(providerIdValue, credentialId, success, statusCode = null) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const entries = store.credentials[providerId] || [];
  const now = new Date().toISOString();
  store.credentials[providerId] = entries.map((entry) => {
    if (entry.id !== credentialId) return entry;
    if (success) return { ...entry, failureCount: 0, cooldownUntil: null, authRejectedAt: null, lastSuccessAt: now };
    const failures = Number(entry.failureCount || 0) + 1;
    const authRejected = statusCode === 401 || statusCode === 403;
    const shouldCooldown = statusCode === 429 || failures >= 3;
    return {
      ...entry,
      failureCount: failures,
      cooldownUntil: shouldCooldown ? new Date(Date.now() + COOLDOWN_MS).toISOString() : entry.cooldownUntil,
      authRejectedAt: authRejected ? now : entry.authRejectedAt || null,
      lastFailureAt: now,
      lastStatusCode: statusCode,
    };
  });
  writeStore(store);
}

export function getCredentialPoolStatus(providerIdValue) {
  const providerId = normalizeProviderId(providerIdValue);
  const entries = readStore().credentials[providerId] || [];
  const now = Date.now();
  const expired = (entry) => entry.expiresAt && Date.parse(entry.expiresAt) <= now;
  const quarantined = (entry) => entry.verification?.status === "quarantined" || entry.verification?.authenticityStatus === "quarantined";
  const coolingDown = (entry) => entry.cooldownUntil && Date.parse(entry.cooldownUntil) > now;
  const rateLimited = (entry) => coolingDown(entry) && Number(entry.lastStatusCode) === 429;
  const authRejected = (entry) => Boolean(entry.authRejectedAt);
  return {
    count: entries.length,
    disabled: entries.filter((entry) => entry.disabled === true).length,
    expired: entries.filter(expired).length,
    quarantined: entries.filter(quarantined).length,
    authRejected: entries.filter(authRejected).length,
    coolingDown: entries.filter(coolingDown).length,
    rateLimited: entries.filter(rateLimited).length,
    ready: entries.filter((entry) => entry.disabled !== true && !expired(entry) && !quarantined(entry) && !authRejected(entry) && !coolingDown(entry)).length,
    quotaTelemetry: { status: "not_available", source: null, note: "External remaining quota is shown only when a provider exposes it through an authorized official API; generic upstream responses cannot prove account quota." },
  };
}

export const __testables = { encrypt, decrypt, normalizeProviderId, normalizeCredential, COOLDOWN_MS, STORE_PATH };
