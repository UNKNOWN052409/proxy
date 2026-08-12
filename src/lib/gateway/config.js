import { getGatewayNotifications, getGatewayRuntimeState, getProviderModels, getProviderSettings } from "./runtime-store.js";
import { getCredentialPoolStatus, markCredentialResult, selectCredential } from "./credentials.js";
import { getDedicatedProviderProfile, listDedicatedProviderProfiles } from "./providers/dedicated.js";

const ALLOWED_SECRET_PREFIXES = ["GATEWAY_", "OPENAI_", "ANTHROPIC_", "DASHSCOPE_", "QWEN_", "MOONSHOT_", "XAI_", "GITLAB_", "LOVABLE_", "KIRO_"];
const SUPPORTED_PROVIDER_TYPES = new Set(["openai", "anthropic", "gitlab", "bedrock"]);

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
  const profile = getDedicatedProviderProfile(id);
  const type = String(provider.type || profile?.type || "openai").trim().toLowerCase();
  const apiKeyEnv = String(provider.apiKeyEnv || profile?.apiKeyEnv || "").trim();
  const region = String(provider.region || profile?.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "").trim();
  const accessKeyEnv = String(provider.accessKeyEnv || profile?.accessKeyEnv || "AWS_ACCESS_KEY_ID").trim();
  const secretKeyEnv = String(provider.secretKeyEnv || profile?.secretKeyEnv || "AWS_SECRET_ACCESS_KEY").trim();
  const sessionTokenEnv = String(provider.sessionTokenEnv || profile?.sessionTokenEnv || "AWS_SESSION_TOKEN").trim();
  const allowNoAuth = provider.allowNoAuth === true && profile?.localOnly === true;
  const credentialPool = getCredentialPoolStatus(id);
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) {
    throw new Error("Provider id must be 2–64 lowercase letters, numbers, hyphens, or underscores");
  }
  if (!SUPPORTED_PROVIDER_TYPES.has(type)) throw new Error(`Provider ${id} has unsupported type: ${type}`);
  if (type === "gitlab" && !provider.baseUrl) throw new Error(`Provider ${id} requires an explicit self-managed GitLab baseUrl`);
  if (type === "bedrock" && !region) throw new Error(`Provider ${id} requires an AWS region`);
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
    baseUrl: normalizeBaseUrl(provider.baseUrl || profile?.baseUrl || (type === "bedrock" ? `https://bedrock-runtime.${region}.amazonaws.com` : null), id),
    apiKeyEnv: apiKeyEnv || null,
    allowNoAuth,
    adapter: String(provider.adapter || profile?.adapter || type).trim().toLowerCase(),
    logoPath: provider.logoPath || profile?.logoPath || null,
    docsUrl: provider.docsUrl || profile?.docsUrl || null,
    officialApi: provider.officialApi || profile?.officialApi || false,
    credentialPool,
    models,
    defaultModel: String(provider.defaultModel || models[0] || "").trim(),
    supportsTools: provider.supportsTools === true || profile?.supportsTools === true,
    supportsVision: provider.supportsVision === true || profile?.supportsVision === true,
    visionProvider: provider.visionProvider ? String(provider.visionProvider).trim().toLowerCase() : null,
    headers: normalizeHeaders(provider.headers),
    enabled: provider.enabled !== false,
    expiresAt: normalizeExpiry(provider.expiresAt, id),
    region: region || null,
    accessKeyEnv: type === "bedrock" ? accessKeyEnv : null,
    secretKeyEnv: type === "bedrock" ? secretKeyEnv : null,
    sessionTokenEnv: type === "bedrock" ? sessionTokenEnv : null,
    routingPriority: Number.isFinite(Number(provider.routingPriority)) ? Number(provider.routingPriority) : 100,
    fallbackProviders: Array.isArray(provider.fallbackProviders) ? provider.fallbackProviders.map((item) => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 20) : [],
    costInputPerMillion: Number.isFinite(Number(provider.costInputPerMillion)) ? Number(provider.costInputPerMillion) : null,
    costOutputPerMillion: Number.isFinite(Number(provider.costOutputPerMillion)) ? Number(provider.costOutputPerMillion) : null,
    contextWindow: Number.isFinite(Number(provider.contextWindow)) ? Number(provider.contextWindow) : null,
    oauthAuthUrl: provider.oauthAuthUrl ? normalizeBaseUrl(provider.oauthAuthUrl, `${id} OAuth authorization`) : null,
    oauthTokenUrl: provider.oauthTokenUrl ? normalizeBaseUrl(provider.oauthTokenUrl, `${id} OAuth token`) : null,
    oauthClientIdEnv: provider.oauthClientIdEnv ? String(provider.oauthClientIdEnv).trim() : null,
    oauthClientSecretEnv: provider.oauthClientSecretEnv ? String(provider.oauthClientSecretEnv).trim() : null,
    oauthScopes: Array.isArray(provider.oauthScopes) ? provider.oauthScopes.map((scope) => String(scope).trim()).filter(Boolean).slice(0, 30) : [],
    oauthRedirectUri: provider.oauthRedirectUri ? String(provider.oauthRedirectUri).trim().slice(0, 512) : null,
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
  if ((process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    const profile = getDedicatedProviderProfile("aws-bedrock");
    providers.push({
      ...profile,
      id: "aws-bedrock",
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
      baseUrl: process.env.GATEWAY_BEDROCK_BASE_URL || `https://bedrock-runtime.${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION}.amazonaws.com`,
      models: splitModels(process.env.GATEWAY_BEDROCK_MODELS).length ? splitModels(process.env.GATEWAY_BEDROCK_MODELS) : profile.models,
      defaultModel: process.env.GATEWAY_BEDROCK_DEFAULT_MODEL || profile.models[0],
    });
  }
  const profileEnvProviders = [
    ["qwen", "DASHSCOPE_API_KEY", "GATEWAY_QWEN_BASE_URL", "GATEWAY_QWEN_MODELS"],
    ["kimi", "MOONSHOT_API_KEY", "GATEWAY_KIMI_BASE_URL", "GATEWAY_KIMI_MODELS"],
    ["grok", "XAI_API_KEY", "GATEWAY_GROK_BASE_URL", "GATEWAY_GROK_MODELS"],
  ];
  for (const [id, secretEnv, baseUrlEnv, modelsEnv] of profileEnvProviders) {
    if (!process.env[secretEnv]) continue;
    const profile = getDedicatedProviderProfile(id);
    providers.push({
      ...profile,
      id,
      baseUrl: process.env[baseUrlEnv] || profile.baseUrl,
      apiKeyEnv: secretEnv,
      models: splitModels(process.env[modelsEnv]).length ? splitModels(process.env[modelsEnv]) : profile.models,
      defaultModel: process.env[`GATEWAY_${id.toUpperCase()}_DEFAULT_MODEL`] || profile.models[0],
    });
  }
  if (process.env.GATEWAY_OPENCODE_ENABLED === "true") {
    const profile = getDedicatedProviderProfile("opencode");
    providers.push({ ...profile, id: "opencode", baseUrl: process.env.GATEWAY_OPENCODE_BASE_URL || profile.baseUrl, models: splitModels(process.env.GATEWAY_OPENCODE_MODELS), allowNoAuth: true });
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
    if (!records.has(id) && provider.baseUrl && (provider.apiKeyEnv || provider.allowNoAuth === true)) records.set(id, { ...provider, id });
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
      configured: provider.type === "bedrock"
        ? Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv])
        : Boolean((apiKeyEnv && process.env[apiKeyEnv]) || provider.credentialPool?.ready),
      credentialPool: provider.credentialPool,
      expired: isProviderExpired(provider),
      health: runtime.health[provider.id] || { status: "unknown", checkedAt: null },
      lastModelRefresh: runtime.modelCatalog[provider.id]?.refreshedAt || null,
      catalogModelCount: runtime.modelCatalog[provider.id]?.models?.length || 0,
      audit: runtime.audits[provider.id] || null,
    })),
    notifications: getGatewayNotifications(),
    lastRefreshAt: runtime.lastRefreshAt,
    supportedProviders: listDedicatedProviderProfiles().map(({ apiKeyEnv, ...profile }) => ({
      ...profile,
      configured: Boolean(apiKeyEnv && process.env[apiKeyEnv]),
    })),
    features: {
      clientManagedTools: true,
      visionFallback: providers.some((provider) => Boolean(provider.visionProvider)),
      directTrafficInterception: false,
      cookieImport: false,
      mergeOnlyConfigurationImport: true,
      providerHealthChecks: true,
      endpointAudit: true,
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
  const ready = provider.type === "bedrock"
    ? Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv])
    : Boolean(apiKey || provider.allowNoAuth);
  if (!ready) throw new Error(`Provider ${provider.id} is missing its configured credential`);
  return { provider, model: modelId, apiKey, credentialId: credential?.credentialId || null, markCredentialResult: (success, statusCode) => credential?.credentialId && markCredentialResult(provider.id, credential.credentialId, success, statusCode) };
}

export function resolveProviderById(providerId) {
  const provider = enabledProviders().find((candidate) => candidate.id === String(providerId || "").toLowerCase());
  if (!provider) throw new Error(`Unknown, disabled, or expired provider: ${providerId}`);
  const credential = selectCredential(provider.id);
  const apiKey = credential?.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  const ready = provider.type === "bedrock"
    ? Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv])
    : Boolean(apiKey || provider.allowNoAuth);
  if (!ready) throw new Error(`Provider ${provider.id} is missing its configured credential`);
  return { provider, apiKey, credentialId: credential?.credentialId || null, markCredentialResult: (success, statusCode) => credential?.credentialId && markCredentialResult(provider.id, credential.credentialId, success, statusCode) };
}

export function listGatewayModels() {
  return enabledProviders().flatMap((provider) => {
    const catalog = getProviderModels(provider.id);
    const metadata = catalog?.metadata || {};
    return provider.models.map((model) => ({
      id: `${provider.id}/${model}`,
      object: "model",
      created: 0,
      owned_by: provider.id,
      context_window: metadata[model]?.contextWindow || provider.contextWindow || null,
      pricing: { input_per_million: metadata[model]?.inputCostPerMillion ?? provider.costInputPerMillion, output_per_million: metadata[model]?.outputCostPerMillion ?? provider.costOutputPerMillion },
      routing: { priority: metadata[model]?.routingPriority ?? provider.routingPriority, fallback_providers: provider.fallbackProviders },
      capabilities: { tools: metadata[model]?.supportsTools ?? provider.supportsTools, vision: metadata[model]?.supportsVision ?? (provider.supportsVision || Boolean(provider.visionProvider)) },
      metadata: metadata[model] || {},
    }));
  });
}

export function getProviderConfiguration(providerId) {
  return getProviderSettings(providerId);
}

export const __testables = { normalizeProvider, normalizeBaseUrl, splitModels, normalizeExpiry, isProviderExpired };
