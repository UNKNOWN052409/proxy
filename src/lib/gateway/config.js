import { URL } from "node:url";

const ALLOWED_SECRET_PREFIXES = ["GATEWAY_", "OPENAI_", "ANTHROPIC_", "DASHSCOPE_", "QWEN_"];
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

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "object") throw new Error("Provider entries must be objects");
  const id = String(provider.id || "").trim().toLowerCase();
  const type = String(provider.type || "openai").trim().toLowerCase();
  const apiKeyEnv = String(provider.apiKeyEnv || "").trim();

  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) {
    throw new Error("Provider id must be 2–64 lowercase letters, numbers, hyphens, or underscores");
  }
  if (!SUPPORTED_PROVIDER_TYPES.has(type)) throw new Error(`Provider ${id} has unsupported type: ${type}`);
  if (!ALLOWED_SECRET_PREFIXES.some((prefix) => apiKeyEnv.startsWith(prefix))) {
    throw new Error(`Provider ${id} must reference a dedicated gateway secret environment variable`);
  }

  return {
    id,
    label: String(provider.label || id),
    type,
    baseUrl: normalizeBaseUrl(provider.baseUrl, id),
    apiKeyEnv,
    models: splitModels(provider.models),
    defaultModel: String(provider.defaultModel || provider.models?.[0] || "").trim(),
    supportsTools: provider.supportsTools === true,
    supportsVision: provider.supportsVision === true,
    visionProvider: provider.visionProvider ? String(provider.visionProvider).trim().toLowerCase() : null,
    headers: provider.headers && typeof provider.headers === "object" ? provider.headers : {},
  };
}

function readConfiguredProviders() {
  const raw = process.env.GATEWAY_PROVIDERS_JSON;
  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("GATEWAY_PROVIDERS_JSON must be valid JSON");
    }
    if (!Array.isArray(parsed)) throw new Error("GATEWAY_PROVIDERS_JSON must contain an array of providers");
    return parsed.map(normalizeProvider);
  }

  const providers = [];
  if (process.env.GATEWAY_OPENAI_API_KEY) {
    providers.push(normalizeProvider({
      id: "openai",
      label: "OpenAI-compatible",
      type: "openai",
      baseUrl: process.env.GATEWAY_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKeyEnv: "GATEWAY_OPENAI_API_KEY",
      models: splitModels(process.env.GATEWAY_OPENAI_MODELS),
      defaultModel: process.env.GATEWAY_OPENAI_DEFAULT_MODEL,
      supportsTools: process.env.GATEWAY_OPENAI_SUPPORTS_TOOLS !== "false",
      supportsVision: process.env.GATEWAY_OPENAI_SUPPORTS_VISION === "true",
    }));
  }
  if (process.env.GATEWAY_ANTHROPIC_API_KEY) {
    providers.push(normalizeProvider({
      id: "anthropic",
      label: "Anthropic",
      type: "anthropic",
      baseUrl: process.env.GATEWAY_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      apiKeyEnv: "GATEWAY_ANTHROPIC_API_KEY",
      models: splitModels(process.env.GATEWAY_ANTHROPIC_MODELS),
      defaultModel: process.env.GATEWAY_ANTHROPIC_DEFAULT_MODEL,
      supportsTools: process.env.GATEWAY_ANTHROPIC_SUPPORTS_TOOLS !== "false",
      supportsVision: process.env.GATEWAY_ANTHROPIC_SUPPORTS_VISION === "true",
    }));
  }
  return providers;
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
  try {
    providers = getGatewayProviders();
  } catch (error) {
    configurationError = error.message;
  }

  return {
    enabled: providers.length > 0 && !configurationError,
    configurationError,
    providers: providers.map(({ apiKeyEnv, headers, ...provider }) => ({
      ...provider,
      configured: Boolean(process.env[apiKeyEnv]),
    })),
    features: {
      clientManagedTools: true,
      visionFallback: providers.some((provider) => Boolean(provider.visionProvider)),
      directTrafficInterception: false,
      cookieImport: false,
    },
  };
}

export function resolveProvider(model) {
  const providers = getGatewayProviders();
  if (providers.length === 0) throw new Error("No gateway providers are configured");

  const requested = String(model || "").trim();
  const separatorIndex = requested.indexOf("/");
  const explicitId = separatorIndex > 0 ? requested.slice(0, separatorIndex).toLowerCase() : null;
  const explicitModel = separatorIndex > 0 ? requested.slice(separatorIndex + 1) : requested;
  const provider = explicitId
    ? providers.find((candidate) => candidate.id === explicitId)
    : providers.find((candidate) => candidate.models.includes(requested)) || providers[0];

  if (!provider) throw new Error(`Unknown provider: ${explicitId}`);
  const modelId = explicitModel || provider.defaultModel || provider.models[0];
  if (!modelId) throw new Error(`Provider ${provider.id} has no model configured`);
  if (provider.models.length > 0 && !provider.models.includes(modelId)) {
    throw new Error(`Model ${modelId} is not enabled for provider ${provider.id}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) throw new Error(`Provider ${provider.id} is missing its configured API key`);
  return { provider, model: modelId, apiKey };
}

export function resolveProviderById(providerId) {
  const provider = getGatewayProviders().find((candidate) => candidate.id === String(providerId || "").toLowerCase());
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) throw new Error(`Provider ${provider.id} is missing its configured API key`);
  return { provider, apiKey };
}

export function listGatewayModels() {
  const providers = getGatewayProviders();
  return providers.flatMap((provider) => provider.models.map((model) => ({
    id: `${provider.id}/${model}`,
    object: "model",
    created: 0,
    owned_by: provider.id,
    capabilities: {
      tools: provider.supportsTools,
      vision: provider.supportsVision || Boolean(provider.visionProvider),
    },
  })));
}

export const __testables = { normalizeProvider, normalizeBaseUrl, splitModels };
