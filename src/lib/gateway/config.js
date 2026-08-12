import { getGatewayNotifications, getGatewayRuntimeState, getProviderModels, getProviderSettings } from "./runtime-store.js";
import { getCredentialPoolStatus, markCredentialResult, selectCredential } from "./credentials.js";

const ALLOWED_SECRET_PREFIXES = ["GATEWAY_", "OPENAI_", "ANTHROPIC_", "DASHSCOPE_", "QWEN_", "XAI_"];
const SUPPORTED_PROVIDER_TYPES = new Set(["openai", "anthropic"]);

function splitModels(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeBaseUrl(value, id) {
  if (!value || typeof value !== "string") throw new Error(`Provider ${id} must define a baseUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Provider ${id} has an invalid baseUrl`);
  }
  const isLocalDevelopmentUrl = parsed.protocol === "http:" && isLoopbackHost(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalDevelopmentUrl) {
    throw new Error(`Provider ${id} baseUrl must use HTTPS (HTTP is limited to loopback development endpoints)`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeExpiry(value, id) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Provider ${id} has an invalid expiresAt timestamp`);
  return new Date(parsed).toISOString();
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = String(name).toLowerCase();
    if (["authorization", "content-length", "host", "connection", "cookie", "x-api-key"].includes(normalized)) continue;
    if (typeof value === "string" && value.length <= 2048) result[name] = value;
  }
  return result;
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "object") throw new Error("Provider entries must be objects");
  const id = String(provider.id || "").trim().toLowerCase();
  const type = String(provider.type || "openai").trim().toLowerCase();
  const apiKeyEnv = String(provider.apiKeyEnv || "").trim();
  const credentialPool = getCredentialPoolStatus(id);
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) {
    throw new Error("Provider id must be 2–64 lowercase letters, numbers, hyphens, or underscores");
  }
  if (!SUPPORTED_PROVIDER_TYPES.has(type)) throw new Error(`Provider ${id} has unsupported type: ${type}`);
  if (apiKeyEnv && !ALLOWED_SECRET_PREFIXES.some((prefix) => apiKeyEnv.startsWith(prefix))) {
    throw new Error(`Provider ${id} must reference a dedicated gateway secret environment variable`);
  }

  const persistedCatalog = getProviderModels(id);
  const configuredModels = splitModels(provider.models);
  const models = configuredModels.length ? configuredModels : (persistedCatalog?.models || []);
  return {
    id,
    label: String(provider.label || id),
    type,
    baseUrl: normalizeBaseUrl(provider.baseUrl, id),
    apiKeyEnv: apiKeyEnv || null,
    credentialPool,
    models,
    defaultModel: String(provider.defaultModel || models[0] || "").trim(),
    supportsTools: provider.supportsTools === true,
    supportsVision: provider.supportsVision === true,
    visionProvider: provider.visionProvider ? String(provider.visionProvider).trim().toLowerCase() : null,
    headers: normalizeHeaders(provider.headers),
    enabled: provider.enabled !== false,
    expiresAt: normalizeExpiry(provider.expiresAt, id),
  };
}

function environmentProviders() {
  const raw = process.env.GATEWAY_PROVIDERS_JSON;
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("GATEWAY_PROVIDERS_JSON must be valid JSON"); }
    if (!Array.isArray(parsed)) throw new Error("GATEWAY_PROVIDERS_JSON must contain an array of providers");
    return parsed;
  }

  const providers = [];
  if (process.env.GATEWAY_OPENAI_API_KEY) {
    providers.push({
      id: "openai", label: "OpenAI-compatible", type: "openai",
      baseUrl: process.env.GATEWAY_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKeyEnv: "GATEWAY_OPENAI_API_KEY", models: splitModels(process.env.GATEWAY_OPENAI_MODELS),
      defaultModel: process.env.GATEWAY_OPENAI_DEFAULT_MODEL,
      supportsTools: process.env.GATEWAY_OPENAI_SUPPORTS_TOOLS !== "false",
      supportsVision: process.env.GATEWAY_OPENAI_SUPPORTS_VISION === "true",
    });
  }
  if (process.env.GATEWAY_ANTHROPIC_API_KEY) {
    providers.push({
      id: "anthropic", label: "Anthropic", type: "anthropic",
      baseUrl: process.env.GATEWAY_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      apiKeyEnv: "GATEWAY_ANTHROPIC_API_KEY", models: splitModels(process.env.GATEWAY_ANTHROPIC_MODELS),
      defaultModel: process.env.GATEWAY_ANTHROPIC_DEFAULT_MODEL,
      supportsTools: process.env.GATEWAY_ANTHROPIC_SUPPORTS_TOOLS !== "false",
      supportsVision: process.env.GATEWAY_ANTHROPIC_SUPPORTS_VISION === "true",
    });
  }
  return providers;
}

function readConfiguredProviders() {
  const runtime = getGatewayRuntimeState();
  const records = new Map();
  for (const provider of environmentProviders()) {
    const id = String(provider?.id || "").trim().toLowerCase();
    if (id) records.set(id, { ...provider, ...(runtime.providers[id] || {}), id });
  }
  for (const [id, provider] of Object.entries(runtime.providers)) {
    if (!records.has(id) && provider.baseUrl && provider.apiKeyEnv) records.set(id, { ...provider, id });
  }
  return [...records.values()].map(normalizeProvider);
}

function isProviderExpired(provider) {
  return Boolean(provider.expiresAt && Date.parse(provider.expiresAt) <= Date.now());
}

export function getGatewayProviders() {
  const providers = readConfiguredProviders();
  const ids = new Set();
  for (const provider of providers) {
    if (ids.has(provider.id)) throw new Error(`Duplicate provider id: ${provider.id}`);
    ids.add(provider.id);
  }
  return providers;
}

export function getGatewayStatus() {
  let providers = [];
  let configurationError = null;
  const runtime = getGatewayRuntimeState();
  try { providers = getGatewayProviders(); } catch (error) { configurationError = error.message; }
  return {
    enabled: providers.some((provider) => provider.enabled && !isProviderExpired(provider)) && !configurationError,
    configurationError,
    providers: providers.map(({ apiKeyEnv, headers, ...provider }) => ({
      ...provider,
      configured: Boolean((apiKeyEnv && process.env[apiKeyEnv]) || provider.credentialPool?.ready),
      credentialPool: provider.credentialPool,
      expired: isProviderExpired(provider),
      health: runtime.health[provider.id] || { status: "unknown", checkedAt: null },
      lastModelRefresh: runtime.modelCatalog[provider.id]?.refreshedAt || null,
      catalogModelCount: runtime.modelCatalog[provider.id]?.models?.length || 0,
    })),
    notifications: getGatewayNotifications(),
    lastRefreshAt: runtime.lastRefreshAt,
    features: {
      clientManagedTools: true,
      visionFallback: providers.some((provider) => Boolean(provider.visionProvider)),
      directTrafficInterception: false,
      cookieImport: false,
      mergeOnlyConfigurationImport: true,
      providerHealthChecks: true,
    },
  };
}

function enabledProviders() {
  return getGatewayProviders().filter((provider) => provider.enabled && !isProviderExpired(provider));
}

export function resolveProvider(model) {
  const providers = enabledProviders();
  if (providers.length === 0) throw new Error("No enabled gateway providers are configured");
  const requested = String(model || "").trim();
  const separatorIndex = requested.indexOf("/");
  const explicitId = separatorIndex > 0 ? requested.slice(0, separatorIndex).toLowerCase() : null;
  const explicitModel = separatorIndex > 0 ? requested.slice(separatorIndex + 1) : requested;
  const provider = explicitId
    ? providers.find((candidate) => candidate.id === explicitId)
    : providers.find((candidate) => candidate.models.includes(requested)) || providers[0];
  if (!provider) throw new Error(`Unknown, disabled, or expired provider: ${explicitId}`);
  const modelId = explicitModel || provider.defaultModel || provider.models[0];
  if (!modelId) throw new Error(`Provider ${provider.id} has no model configured; refresh its model catalog or configure models explicitly`);
  if (provider.models.length > 0 && !provider.models.includes(modelId)) {
    throw new Error(`Model ${modelId} is not enabled for provider ${provider.id}`);
  }
  const credential = selectCredential(provider.id);
  const apiKey = credential?.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey) throw new Error(`Provider ${provider.id} is missing its configured API key`);
  return { provider, model: modelId, apiKey, credentialId: credential?.credentialId || null, markCredentialResult: (success, statusCode) => credential?.credentialId && markCredentialResult(provider.id, credential.credentialId, success, statusCode) };
}

export function resolveProviderById(providerId) {
  const provider = enabledProviders().find((candidate) => candidate.id === String(providerId || "").toLowerCase());
  if (!provider) throw new Error(`Unknown, disabled, or expired provider: ${providerId}`);
  const credential = selectCredential(provider.id);
  const apiKey = credential?.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey) throw new Error(`Provider ${provider.id} is missing its configured API key`);
  return { provider, apiKey, credentialId: credential?.credentialId || null, markCredentialResult: (success, statusCode) => credential?.credentialId && markCredentialResult(provider.id, credential.credentialId, success, statusCode) };
}

export function listGatewayModels() {
  return enabledProviders().flatMap((provider) => provider.models.map((model) => ({
    id: `${provider.id}/${model}`,
    object: "model",
    created: 0,
    owned_by: provider.id,
    capabilities: { tools: provider.supportsTools, vision: provider.supportsVision || Boolean(provider.visionProvider) },
  })));
}

export function getProviderConfiguration(providerId) {
  return getProviderSettings(providerId);
}

export const __testables = { normalizeProvider, normalizeBaseUrl, splitModels, normalizeExpiry, isProviderExpired };
