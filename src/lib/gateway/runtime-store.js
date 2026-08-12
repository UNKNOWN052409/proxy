import { userConfig } from "../config/store.js";

const STATE_KEY = "gatewayRuntime";
const PROVIDER_FIELDS = new Set([
  "id", "label", "type", "baseUrl", "apiKeyEnv", "models", "defaultModel",
  "supportsTools", "supportsVision", "visionProvider", "headers", "enabled", "expiresAt",
]);
const FORBIDDEN_FIELDS = new Set([
  "apikey", "key", "token", "accesstoken", "refreshtoken", "cookie", "cookies", "authorization", "password",
]);
const FORBIDDEN_HEADER_NAMES = new Set(["authorization", "cookie", "x-api-key", "proxy-authorization"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultState() {
  return { providers: {}, health: {}, modelCatalog: {}, audits: {}, lastRefreshAt: null };
}

function readState() {
  const raw = userConfig.get()[STATE_KEY];
  if (!raw || typeof raw !== "object") return defaultState();
  return {
    providers: raw.providers && typeof raw.providers === "object" ? raw.providers : {},
    health: raw.health && typeof raw.health === "object" ? raw.health : {},
    modelCatalog: raw.modelCatalog && typeof raw.modelCatalog === "object" ? raw.modelCatalog : {},
    audits: raw.audits && typeof raw.audits === "object" ? raw.audits : {},
    lastRefreshAt: typeof raw.lastRefreshAt === "string" ? raw.lastRefreshAt : null,
  };
}

function writeState(state) {
  userConfig.set(STATE_KEY, state);
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = String(name).trim().toLowerCase();
    if (!normalized || FORBIDDEN_HEADER_NAMES.has(normalized)) {
      throw new Error(`Header ${name} is not allowed in imported gateway configuration`);
    }
    if (typeof value === "string" && value.length <= 2048) result[name] = value;
  }
  return result;
}

function sanitizeProvider(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Provider imports must be objects");
  const id = normalizeId(input.id);
  if (!id) throw new Error("Provider import requires an id");

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) {
      throw new Error(`Provider import must not include ${key}; configure secrets through the server environment`);
    }
  }

  const clean = { id };
  for (const field of PROVIDER_FIELDS) {
    if (field === "id" || input[field] === undefined) continue;
    if (field === "headers") clean.headers = sanitizeHeaders(input.headers);
    else clean[field] = input[field];
  }
  return clean;
}

export function getGatewayRuntimeState() {
  return clone(readState());
}

export function restoreGatewayRuntimeState(state) {
  if (!state || typeof state !== "object") throw new Error("A valid gateway runtime state is required");
  writeState(clone({
    providers: state.providers && typeof state.providers === "object" ? state.providers : {},
    health: state.health && typeof state.health === "object" ? state.health : {},
    modelCatalog: state.modelCatalog && typeof state.modelCatalog === "object" ? state.modelCatalog : {},
    audits: state.audits && typeof state.audits === "object" ? state.audits : {},
    lastRefreshAt: typeof state.lastRefreshAt === "string" ? state.lastRefreshAt : null,
  }));
}

export function getProviderSettings(providerId) {
  return clone(readState().providers[normalizeId(providerId)] || {});
}

export function mergeProviderConfiguration(entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) throw new Error("At least one provider configuration is required");
  if (list.length > 50) throw new Error("At most 50 provider configurations may be imported at once");

  const state = readState();
  const results = [];
  for (const entry of list) {
    const clean = sanitizeProvider(entry);
    const previous = state.providers[clean.id] || {};
    state.providers[clean.id] = { ...previous, ...clean, id: clean.id, updatedAt: new Date().toISOString() };
    results.push({ id: clean.id, action: Object.keys(previous).length ? "updated" : "added" });
  }
  writeState(state);
  return results;
}

export function setProviderEnabled(providerId, enabled) {
  const id = normalizeId(providerId);
  const state = readState();
  if (!state.providers[id]) state.providers[id] = { id };
  state.providers[id] = { ...state.providers[id], enabled: Boolean(enabled), updatedAt: new Date().toISOString() };
  writeState(state);
  return clone(state.providers[id]);
}

export function setProviderHealth(providerId, health) {
  const id = normalizeId(providerId);
  const state = readState();
  state.health[id] = {
    ...(state.health[id] || {}),
    status: String(health.status || "unknown"),
    checkedAt: new Date().toISOString(),
    latencyMs: Number.isFinite(health.latencyMs) ? Math.round(health.latencyMs) : null,
    httpStatus: Number.isInteger(health.httpStatus) ? health.httpStatus : null,
    message: health.message ? String(health.message).slice(0, 500) : null,
  };
  writeState(state);
  return clone(state.health[id]);
}

export function saveProviderModels(providerId, models) {
  const id = normalizeId(providerId);
  const safeModels = [...new Set((models || [])
    .filter((model) => typeof model === "string" && model.trim())
    .map((model) => model.trim().slice(0, 256)))]
    .slice(0, 1000);
  const state = readState();
  state.modelCatalog[id] = { models: safeModels, refreshedAt: new Date().toISOString() };
  state.lastRefreshAt = state.modelCatalog[id].refreshedAt;
  writeState(state);
  return clone(state.modelCatalog[id]);
}

export function getProviderModels(providerId) {
  const entry = readState().modelCatalog[normalizeId(providerId)];
  return entry ? clone(entry) : null;
}

export function saveProviderAudit(providerId, audit) {
  const id = normalizeId(providerId);
  const state = readState();
  state.audits[id] = clone({
    checkedAt: audit.checkedAt,
    providerId: id,
    advertisedModel: audit.advertisedModel || null,
    modelList: Array.isArray(audit.modelList) ? audit.modelList.slice(0, 100) : [],
    modelListStatus: audit.modelListStatus || null,
    probeStatus: audit.probeStatus || null,
    identity: audit.identity || { verdict: "unknown", confidence: 0.1, evidence: [] },
    leakage: audit.leakage || { passed: true, findings: [], storedContent: false },
    probeTokenMatched: Boolean(audit.probeTokenMatched),
    upstreamLatencyMs: Number.isFinite(audit.upstreamLatencyMs) ? audit.upstreamLatencyMs : null,
    auditDurationMs: Number.isFinite(audit.auditDurationMs) ? audit.auditDurationMs : null,
    proxyOverheadMs: Number.isFinite(audit.proxyOverheadMs) ? audit.proxyOverheadMs : null,
    proxyOverheadTargetMs: 1,
    proxyOverheadUnderTarget: Boolean(audit.proxyOverheadUnderTarget),
    routingSignals: Array.isArray(audit.routingSignals) ? audit.routingSignals.slice(0, 20) : [],
    error: audit.error ? String(audit.error).slice(0, 300) : null,
    storedResponse: false,
  });
  writeState(state);
  return clone(state.audits[id]);
}

export function getProviderAudit(providerId) {
  const audit = readState().audits[normalizeId(providerId)];
  return audit ? clone(audit) : null;
}

export function getGatewayNotifications() {
  const state = readState();
  const now = Date.now();
  const notifications = [];
  for (const [id, provider] of Object.entries(state.providers)) {
    const expiry = provider.expiresAt ? Date.parse(provider.expiresAt) : NaN;
    if (Number.isFinite(expiry) && expiry <= now) {
      notifications.push({ id: `provider-expired-${id}`, severity: "error", providerId: id, message: `${provider.label || id} credentials are marked expired` });
    } else if (Number.isFinite(expiry) && expiry - now <= 72 * 60 * 60 * 1000) {
      notifications.push({ id: `provider-expiring-${id}`, severity: "warning", providerId: id, message: `${provider.label || id} credentials expire within 72 hours` });
    }
    const health = state.health[id];
    if (health?.status === "authentication_error") {
      notifications.push({ id: `provider-auth-${id}`, severity: "error", providerId: id, message: `${provider.label || id} rejected its configured API credential` });
    }
  }
  return notifications;
}

export const __testables = { sanitizeProvider, sanitizeHeaders, defaultState };
