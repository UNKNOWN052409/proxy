import { getGatewayProviders } from "./config.js";
import { getCredentialPoolStatus, selectCredential } from "./credentials.js";
import { saveProviderModels, setProviderHealth } from "./runtime-store.js";

const TIMEOUT_MS = 12_000;

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function extraHeaders(headers = {}) {
  const safe = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = String(name).toLowerCase();
    if (["authorization", "x-api-key", "content-length", "host", "connection", "cookie"].includes(normalized)) continue;
    if (typeof value === "string" && value.length <= 2048) safe[name] = value;
  }
  return safe;
}

function providerHeaders(provider, apiKey) {
  if (provider.type === "anthropic") {
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", ...extraHeaders(provider.headers) };
  }
  return { Authorization: `Bearer ${apiKey}`, ...extraHeaders(provider.headers) };
}

function modelEndpoint(provider) {
  if (provider.type === "gitlab") return endpoint(provider.baseUrl.replace(/\/api\/v4\/?$/, ""), "/api/v4/version");
  return provider.type === "anthropic"
    ? `${endpoint(provider.baseUrl, "/models")}?limit=1000`
    : endpoint(provider.baseUrl, "/models");
}

function extractModels(provider, data) {
  const list = Array.isArray(data?.data) ? data.data : null;
  if (!list) throw new Error("Provider returned an invalid model-list response");
  return [...new Set(list.map((model) => String(model?.id || "").trim()).filter(Boolean))].slice(0, 1000);
}

function statusFor(responseStatus) {
  if (responseStatus === 401 || responseStatus === 403) return "authentication_error";
  if (responseStatus === 429) return "rate_limited";
  if (responseStatus >= 500) return "unavailable";
  return "error";
}

export async function refreshGatewayProvider(providerId) {
  const provider = getGatewayProviders().find((candidate) => candidate.id === String(providerId || "").toLowerCase());
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const credential = selectCredential(provider.id);
  const apiKey = credential?.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey && !provider.allowNoAuth) {
    const health = setProviderHealth(provider.id, { status: "missing_configuration", message: "Configured API-key environment variable or encrypted credential pool is unavailable" });
    return { providerId: provider.id, ok: false, modelCount: 0, health, error: health.message };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(modelEndpoint(provider), { headers: providerHeaders(provider, apiKey), signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `Provider returned HTTP ${response.status}`;
      const health = setProviderHealth(provider.id, { status: statusFor(response.status), httpStatus: response.status, latencyMs, message });
      return { providerId: provider.id, ok: false, modelCount: 0, health, error: health.message };
    }
    const models = provider.type === "gitlab"
      ? (provider.models.length ? provider.models : ["duo-chat"])
      : extractModels(provider, payload);
    const catalog = saveProviderModels(provider.id, models);
    const health = setProviderHealth(provider.id, { status: "healthy", httpStatus: response.status, latencyMs, message: null });
    return { providerId: provider.id, ok: true, modelCount: models.length, models, catalog, health };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const timedOut = error?.name === "AbortError";
    const health = setProviderHealth(provider.id, {
      status: timedOut ? "timeout" : "unavailable",
      latencyMs,
      message: timedOut ? "Provider model-list request timed out" : "Provider could not be reached",
    });
    return { providerId: provider.id, ok: false, modelCount: 0, health, error: health.message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshGatewayModels(providerIds = null) {
  const requested = providerIds === null
    ? getGatewayProviders().map((provider) => provider.id)
    : [...new Set((Array.isArray(providerIds) ? providerIds : [providerIds]).map((id) => String(id).toLowerCase()))];
  const results = [];
  for (const id of requested) results.push(await refreshGatewayProvider(id));
  return {
    ok: results.every((result) => result.ok),
    refreshedAt: new Date().toISOString(),
    totalModels: results.reduce((total, result) => total + result.modelCount, 0),
    results,
  };
}

export const __testables = { extractModels, modelEndpoint, statusFor, providerHeaders };
