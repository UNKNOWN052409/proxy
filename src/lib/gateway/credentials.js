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
  if (!secret || secret.length > 4096 || /[\r\n]/.test(secret)) throw new Error("Each credential must contain one bounded API key or token");
  const label = String(entry.label || "credential").trim().slice(0, 120) || "credential";
  const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null;
  return {
    id: crypto.randomUUID(),
    providerId,
    label,
    encrypted: encrypt(secret),
    createdAt: new Date().toISOString(),
    expiresAt,
    failureCount: 0,
    cooldownUntil: null,
    lastUsedAt: null,
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
  return (readStore().credentials[providerId] || []).map(({ id, providerId: idProvider, label, createdAt, expiresAt, failureCount, cooldownUntil, lastUsedAt }) => ({ id, providerId: idProvider, label, createdAt, expiresAt, failureCount, cooldownUntil, lastUsedAt }));
}

export function selectCredential(providerIdValue) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const now = Date.now();
  const candidates = (store.credentials[providerId] || []).filter((entry) => {
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= now) return false;
    return !entry.cooldownUntil || Date.parse(entry.cooldownUntil) <= now;
  });
  candidates.sort((a, b) => Date.parse(a.lastUsedAt || a.createdAt) - Date.parse(b.lastUsedAt || b.createdAt));
  const selected = candidates[0];
  if (!selected) return null;
  selected.lastUsedAt = new Date().toISOString();
  store.credentials[providerId] = store.credentials[providerId].map((entry) => entry.id === selected.id ? selected : entry);
  writeStore(store);
  return { credentialId: selected.id, apiKey: decrypt(selected.encrypted) };
}

export function markCredentialResult(providerIdValue, credentialId, success, statusCode = null) {
  const providerId = normalizeProviderId(providerIdValue);
  const store = readStore();
  const entries = store.credentials[providerId] || [];
  const now = new Date().toISOString();
  store.credentials[providerId] = entries.map((entry) => {
    if (entry.id !== credentialId) return entry;
    if (success) return { ...entry, failureCount: 0, cooldownUntil: null, lastSuccessAt: now };
    const failures = Number(entry.failureCount || 0) + 1;
    const shouldCooldown = statusCode === 401 || statusCode === 403 || statusCode === 429 || failures >= 3;
    return { ...entry, failureCount: failures, cooldownUntil: shouldCooldown ? new Date(Date.now() + COOLDOWN_MS).toISOString() : entry.cooldownUntil, lastFailureAt: now, lastStatusCode: statusCode };
  });
  writeStore(store);
}

export function getCredentialPoolStatus(providerIdValue) {
  const providerId = normalizeProviderId(providerIdValue);
  const entries = readStore().credentials[providerId] || [];
  return {
    count: entries.length,
    ready: entries.filter((entry) => !entry.cooldownUntil || Date.parse(entry.cooldownUntil) <= Date.now()).length,
    expired: entries.filter((entry) => entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()).length,
  };
}

export const __testables = { encrypt, decrypt, normalizeProviderId, normalizeCredential, COOLDOWN_MS, STORE_PATH };
