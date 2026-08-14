import { getGatewayNotifications, getGatewayRuntimeState, getProviderModels, getProviderSettings, isProviderQuarantined } from "./runtime-store.js";
import { getCredentialPoolStatus, markCredentialResult, selectCredential } from "./credentials.js";
import { getDedicatedProviderProfile, listDedicatedProviderProfiles } from "./providers/dedicated.js";

const ALLOWED_SECRET_PREFIXES = ["GATEWAY_", "OPENAI_", "ANTHROPIC_", "GEMINI_", "DASHSCOPE_", "QWEN_", "MOONSHOT_", "XAI_", "MIMO_", "XIAOMI_", "GITLAB_", "LOVABLE_", "KIRO_", "DEEPSEEK_", "GROQ_", "PERPLEXITY_", "MISTRAL_", "COHERE_", "HUGGINGFACE_", "VERTEX_", "AZURE_", "NOTION_", "WINDSURF_", "OPENROUTER_", "TOGETHER_", "FIREWORKS_", "CEREBRAS_", "SAMBANOVA_", "NVIDIA_", "CLOUDFLARE_", "AI_GATEWAY_"];
const SUPPORTED_PROVIDER_TYPES = new Set(["openai", "anthropic", "gemini", "gitlab", "bedrock", "custom", "connector"]);

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

function normalizeBaseUrl(value, id, { allowInsecureHttp = false } = {}) {
  if (!value || typeof value !== "string") throw new Error(`Provider ${id} must define a baseUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Provider ${id} has an invalid baseUrl`);
  }
  const isLocalDevelopmentUrl = parsed.protocol === "http:" && isLoopbackHost(parsed.hostname);
  const isExplicitCustomHttp = parsed.protocol === "http:" && allowInsecureHttp;
  if (parsed.protocol !== "https:" && !isLocalDevelopmentUrl && !isExplicitCustomHttp) {
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
  const prefix = String(provider.prefix || "").trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
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
  const insecureHttp = type === "custom" && provider.insecureHttp === true;
  const configuredModels = splitModels(provider.models);
  const models = configuredModels.length ? configuredModels : (persistedCatalog?.models || []);
  return {
    id,
    label: String(provider.label || id).trim().slice(0, 120),
    type,
    prefix: prefix || null,
    baseUrl: normalizeBaseUrl(provider.baseUrl || profile?.baseUrl || (type === "bedrock" ? `https://bedrock-runtime.${region}.amazonaws.com` : null), id, { allowInsecureHttp: insecureHttp }),
    apiKeyEnv: apiKeyEnv || null,
    insecureHttp,
    allowNoAuth,
    adapter: String(provider.adapter || profile?.adapter || type).trim().toLowerCase(),
    logoPath: provider.logoPath || profile?.logoPath || null,
    docsUrl: provider.docsUrl || profile?.docsUrl || null,
    officialApi: provider.officialApi || profile?.officialApi || false,
    authModes: Array.isArray(provider.authModes || profile?.authModes) ? [...(provider.authModes || profile?.authModes)].map((mode) => String(mode).trim()).filter(Boolean).slice(0, 10) : [],
    oauthStatus: provider.oauthStatus || profile?.oauthStatus || null,
    credentialPool,
    models,
    defaultModel: String(provider.defaultModel || models[0] || "").trim(),
    supportsTools: provider.supportsTools === true || profile?.supportsTools === true,
    supportsVision: provider.supportsVision === true || profile?.supportsVision === true,
    supportsImageGeneration: provider.supportsImageGeneration === true || profile?.supportsImageGeneration === true,
    authMode: String(provider.authMode || profile?.authMode || "api-key").trim().toLowerCase(),
    visionProvider: provider.visionProvider ? String(provider.visionProvider).trim().toLowerCase() : null,
    headers: normalizeHeaders(provider.headers),
    apiKeyHeader: String(provider.apiKeyHeader || profile?.apiKeyHeader || "authorization").trim().toLowerCase(),
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
    oauthAuthUrl: provider.oauthAuthUrl ? normalizeBaseUrl(provider.oauthAuthUrl, `${id} OAuth authorization`) : (profile?.oauthAuthUrl ? normalizeBaseUrl(profile.oauthAuthUrl, `${id} OAuth authorization`) : null),
    oauthDeviceCodeUrl: provider.oauthDeviceCodeUrl ? normalizeBaseUrl(provider.oauthDeviceCodeUrl, `${id} OAuth device authorization`) : (profile?.oauthDeviceCodeUrl ? normalizeBaseUrl(profile.oauthDeviceCodeUrl, `${id} OAuth device authorization`) : null),
    oauthTokenUrl: provider.oauthTokenUrl ? normalizeBaseUrl(provider.oauthTokenUrl, `${id} OAuth token`) : (profile?.oauthTokenUrl ? normalizeBaseUrl(profile.oauthTokenUrl, `${id} OAuth token`) : null),
    oauthClientIdEnv: provider.oauthClientIdEnv ? String(provider.oauthClientIdEnv).trim() : null,
    oauthClientSecretEnv: provider.oauthClientSecretEnv ? String(provider.oauthClientSecretEnv).trim() : null,
    oauthTokenAuth: String(provider.oauthTokenAuth || profile?.oauthTokenAuth || "").trim().toLowerCase() || null,
    oauthTokenContentType: String(provider.oauthTokenContentType || profile?.oauthTokenContentType || "").trim().toLowerCase() || null,
    oauthQueryParams: provider.oauthQueryParams && typeof provider.oauthQueryParams === "object" ? { ...provider.oauthQueryParams } : (profile?.oauthQueryParams || {}),
    oauthScopes: Array.isArray(provider.oauthScopes) ? provider.oauthScopes.map((scope) => String(scope).trim()).filter(Boolean).slice(0, 30) : (Array.isArray(profile?.oauthScopes) ? profile.oauthScopes : []),
    oauthRedirectUri: provider.oauthRedirectUri ? String(provider.oauthRedirectUri).trim().slice(0, 512) : null,
    oauthPkce: provider.oauthPkce === true || profile?.oauthPkce === true,
    oauthOnly: provider.oauthOnly === true || profile?.oauthOnly === true,
    connectorOnly: provider.connectorOnly === true || profile?.connectorOnly === true,
    connectorType: provider.connectorType || profile?.connectorType || null,
    serviceKeyEnv: provider.serviceKeyEnv || profile?.serviceKeyEnv || null,
    apiVersion: provider.apiVersion || profile?.apiVersion || null,
    availabilityNote: provider.availabilityNote || profile?.availabilityNote || null,
    catalogOnly: provider.catalogOnly === true || profile?.catalogOnly === true,
    freeTierCatalog: provider.freeTierCatalog === true || profile?.freeTierCatalog === true,
    localOnly: provider.localOnly === true || profile?.localOnly === true,
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
      supportsImageGeneration: process.env.GATEWAY_OPENAI_SUPPORTS_IMAGE_GENERATION === "true",
    });
  }
  if (process.env.GEMINI_API_KEY || process.env.GEMINI_OAUTH_CLIENT_ID) {
    const profile = getDedicatedProviderProfile("gemini");
    providers.push({
      ...profile,
      id: "gemini",
      baseUrl: process.env.GATEWAY_GEMINI_BASE_URL || profile.baseUrl,
      apiKeyEnv: process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : null,
      oauthClientIdEnv: process.env.GEMINI_OAUTH_CLIENT_ID ? "GEMINI_OAUTH_CLIENT_ID" : null,
      oauthClientSecretEnv: process.env.GEMINI_OAUTH_CLIENT_SECRET ? "GEMINI_OAUTH_CLIENT_SECRET" : null,
      models: splitModels(process.env.GATEWAY_GEMINI_MODELS).length ? splitModels(process.env.GATEWAY_GEMINI_MODELS) : profile.models,
      defaultModel: process.env.GATEWAY_GEMINI_DEFAULT_MODEL || profile.models[0],
      authMode: process.env.GATEWAY_GEMINI_AUTH_MODE || (process.env.GEMINI_API_KEY ? "api-key" : "oauth2-bearer"),
    });
  }
  if (process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_OAUTH_CLIENT_ID) {
    const profile = getDedicatedProviderProfile("azure-openai");
    providers.push({
      ...profile,
      id: "azure-openai",
      baseUrl: process.env.GATEWAY_AZURE_OPENAI_BASE_URL || profile.baseUrl,
      apiKeyEnv: process.env.AZURE_OPENAI_API_KEY ? "AZURE_OPENAI_API_KEY" : null,
      oauthClientIdEnv: process.env.AZURE_OPENAI_OAUTH_CLIENT_ID ? "AZURE_OPENAI_OAUTH_CLIENT_ID" : null,
      oauthClientSecretEnv: process.env.AZURE_OPENAI_OAUTH_CLIENT_SECRET ? "AZURE_OPENAI_OAUTH_CLIENT_SECRET" : null,
      models: splitModels(process.env.GATEWAY_AZURE_OPENAI_MODELS),
      defaultModel: process.env.GATEWAY_AZURE_OPENAI_DEFAULT_MODEL,
      authMode: process.env.AZURE_OPENAI_API_KEY ? "api-key" : "oauth2-bearer",
      requiresBaseUrl: true,
    });
  }
  const kiroTokenEnv = process.env.KIRO_AUTH_TOKEN ? "KIRO_AUTH_TOKEN" : (process.env.KIRO_API_KEY ? "KIRO_API_KEY" : null);
  if (kiroTokenEnv) {
    const profile = getDedicatedProviderProfile("kiro");
    providers.push({
      ...profile,
      id: "kiro",
      baseUrl: process.env.GATEWAY_KIRO_BASE_URL || process.env.KIRO_BASE_URL || null,
      apiKeyEnv: kiroTokenEnv,
      models: splitModels(process.env.GATEWAY_KIRO_MODELS),
      defaultModel: process.env.GATEWAY_KIRO_DEFAULT_MODEL,
      authMode: process.env.KIRO_AUTH_TOKEN ? "bearer-token" : "api-key",
      requiresBaseUrl: true,
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
  const qwenApiKeyEnv = process.env.GATEWAY_QWEN_API_KEY_ENV || "DASHSCOPE_API_KEY";
  const qwenPlan = String(process.env.GATEWAY_QWEN_PLAN || "standard").trim().toLowerCase();
  const qwenRegion = String(process.env.GATEWAY_QWEN_REGION || "intl").trim().toLowerCase();
  const qwenDefaultBaseUrl = qwenPlan === "coding-plan"
    ? (qwenRegion === "beijing" ? "https://coding.dashscope.aliyuncs.com/v1" : "https://coding-intl.dashscope.aliyuncs.com/v1")
    : (qwenRegion === "beijing" ? "https://dashscope.aliyuncs.com/compatible-mode/v1" : "https://dashscope-intl.aliyuncs.com/compatible-mode/v1");
  const mimoPlan = String(process.env.GATEWAY_MIMO_PLAN || "standard").trim().toLowerCase();
  const mimoDefaultBaseUrl = mimoPlan === "token-plan"
    ? (process.env.GATEWAY_MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1")
    : "https://api.xiaomimimo.com/v1";
  const profileEnvProviders = [
    ["qwen", qwenApiKeyEnv, "GATEWAY_QWEN_BASE_URL", "GATEWAY_QWEN_MODELS", qwenDefaultBaseUrl],
    ["mimo", process.env.GATEWAY_MIMO_API_KEY_ENV || "MIMO_API_KEY", "GATEWAY_MIMO_BASE_URL", "GATEWAY_MIMO_MODELS", mimoDefaultBaseUrl],
    ["kimi", "MOONSHOT_API_KEY", "GATEWAY_KIMI_BASE_URL", "GATEWAY_KIMI_MODELS", null],
    ["grok", "XAI_API_KEY", "GATEWAY_GROK_BASE_URL", "GATEWAY_GROK_MODELS", null],
    ["deepseek", "DEEPSEEK_API_KEY", "GATEWAY_DEEPSEEK_BASE_URL", "GATEWAY_DEEPSEEK_MODELS", null],
    ["groq", "GROQ_API_KEY", "GATEWAY_GROQ_BASE_URL", "GATEWAY_GROQ_MODELS", null],
    ["perplexity", "PERPLEXITY_API_KEY", "GATEWAY_PERPLEXITY_BASE_URL", "GATEWAY_PERPLEXITY_MODELS", null],
    ["mistral", "MISTRAL_API_KEY", "GATEWAY_MISTRAL_BASE_URL", "GATEWAY_MISTRAL_MODELS", null],
    ["cohere", "COHERE_API_KEY", "GATEWAY_COHERE_BASE_URL", "GATEWAY_COHERE_MODELS", null],
    ["huggingface", "HUGGINGFACE_API_KEY", "GATEWAY_HUGGINGFACE_BASE_URL", "GATEWAY_HUGGINGFACE_MODELS", null],
    ["openrouter", "OPENROUTER_API_KEY", "GATEWAY_OPENROUTER_BASE_URL", "GATEWAY_OPENROUTER_MODELS", null],
    ["together", "TOGETHER_API_KEY", "GATEWAY_TOGETHER_BASE_URL", "GATEWAY_TOGETHER_MODELS", null],
    ["fireworks", "FIREWORKS_API_KEY", "GATEWAY_FIREWORKS_BASE_URL", "GATEWAY_FIREWORKS_MODELS", null],
    ["cerebras", "CEREBRAS_API_KEY", "GATEWAY_CEREBRAS_BASE_URL", "GATEWAY_CEREBRAS_MODELS", null],
    ["sambanova", "SAMBANOVA_API_KEY", "GATEWAY_SAMBANOVA_BASE_URL", "GATEWAY_SAMBANOVA_MODELS", null],
    ["nvidia-nim", "NVIDIA_API_KEY", "GATEWAY_NVIDIA_NIM_BASE_URL", "GATEWAY_NVIDIA_NIM_MODELS", null],
    ["vercel-ai-gateway", "AI_GATEWAY_API_KEY", "GATEWAY_VERCEL_AI_GATEWAY_BASE_URL", "GATEWAY_VERCEL_AI_GATEWAY_MODELS", null],
  ];
  if (qwenApiKeyEnv !== "DASHSCOPE_API_KEY" && !qwenApiKeyEnv.startsWith("GATEWAY_")) {
    throw new Error("GATEWAY_QWEN_API_KEY_ENV must reference a dedicated gateway secret variable");
  }
  for (const [id, secretEnv, baseUrlEnv, modelsEnv, defaultBaseUrl] of profileEnvProviders) {
    // Hugging Face OAuth and static-token configuration share a single profile below.
    if (id === "huggingface" && process.env.HUGGINGFACE_OAUTH_CLIENT_ID) continue;
    if (!process.env[secretEnv]) continue;
    const profile = getDedicatedProviderProfile(id);
    providers.push({
      ...profile,
      id,
      baseUrl: process.env[baseUrlEnv] || defaultBaseUrl || profile.baseUrl,
      apiKeyEnv: secretEnv,
      models: splitModels(process.env[modelsEnv]).length ? splitModels(process.env[modelsEnv]) : profile.models,
      defaultModel: process.env[`GATEWAY_${id.toUpperCase()}_DEFAULT_MODEL`] || profile.models[0],
      ...(id === "qwen" ? { qwenPlan, qwenRegion } : {}),
      ...(id === "mimo" ? { mimoPlan } : {}),
    });
  }
  if (process.env.HUGGINGFACE_OAUTH_CLIENT_ID) {
    const profile = getDedicatedProviderProfile("huggingface");
    providers.push({
      ...profile,
      id: "huggingface",
      apiKeyEnv: process.env.HUGGINGFACE_API_KEY ? "HUGGINGFACE_API_KEY" : null,
      oauthClientIdEnv: "HUGGINGFACE_OAUTH_CLIENT_ID",
      oauthClientSecretEnv: process.env.HUGGINGFACE_OAUTH_CLIENT_SECRET ? "HUGGINGFACE_OAUTH_CLIENT_SECRET" : null,
      baseUrl: process.env.GATEWAY_HUGGINGFACE_BASE_URL || profile.baseUrl,
      models: splitModels(process.env.GATEWAY_HUGGINGFACE_MODELS),
      defaultModel: process.env.GATEWAY_HUGGINGFACE_DEFAULT_MODEL || profile.models[0],
      authMode: process.env.HUGGINGFACE_API_KEY ? "api-key" : "oauth2-bearer",
    });
  }
  if (process.env.MANUS_OAUTH_CLIENT_ID) {
    const profile = getDedicatedProviderProfile("manus");
    providers.push({
      ...profile,
      id: "manus",
      oauthClientIdEnv: "MANUS_OAUTH_CLIENT_ID",
      oauthClientSecretEnv: process.env.MANUS_OAUTH_CLIENT_SECRET ? "MANUS_OAUTH_CLIENT_SECRET" : null,
      oauthRedirectUri: process.env.MANUS_OAUTH_REDIRECT_URI || null,
      oauthScopes: splitModels(process.env.MANUS_OAUTH_SCOPES).length ? splitModels(process.env.MANUS_OAUTH_SCOPES) : profile.oauthScopes,
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

function providerOperations(provider, { configured = false, credentialPool = null, quarantined = false } = {}) {
  const pool = credentialPool || provider.credentialPool || getCredentialPoolStatus(provider.id);
  const expired = isProviderExpired(provider);
  const environmentCredential = provider.type === "bedrock"
    ? Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv])
    : Boolean(provider.apiKeyEnv && process.env[provider.apiKeyEnv]);
  const localNoAuth = provider.allowNoAuth === true || provider.localOnly === true;
  let routingStatus = "eligible";
  let routingReason = "Provider can be selected for eligible model routes.";
  if (provider.enabled === false) {
    routingStatus = "disabled";
    routingReason = "Administrator disabled this provider.";
  } else if (expired) {
    routingStatus = "expired";
    routingReason = "The provider activation window has expired.";
  } else if (quarantined) {
    routingStatus = "quarantined";
    routingReason = "Provider is quarantined after an authenticity or health review.";
  } else if (!configured && !environmentCredential && !pool.ready && !localNoAuth) {
    routingStatus = "not_configured";
    routingReason = "No usable authorized credential or workload identity is configured.";
  } else if (!environmentCredential && !pool.ready && !localNoAuth) {
    routingStatus = "credential_blocked";
    routingReason = "All imported credentials are disabled, expired, rejected, rate-limited, or quarantined.";
  }
  return {
    active: provider.enabled !== false,
    routingStatus,
    routingEligible: routingStatus === "eligible",
    routingReason,
    accounts: {
      total: pool.count || 0,
      ready: pool.ready || 0,
      disabled: pool.disabled || 0,
      expired: pool.expired || 0,
      quarantined: pool.quarantined || 0,
      authRejected: pool.authRejected || 0,
      rateLimited: pool.rateLimited || 0,
      coolingDown: pool.coolingDown || 0,
    },
    quotaTelemetry: pool.quotaTelemetry || { status: "not_available", source: null, note: "No official quota telemetry is configured." },
  };
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
    enabled: providers.some((provider) => provider.enabled && !isProviderExpired(provider) && !isProviderQuarantined(provider.id) && hasRoutableCredential(provider)) && !configurationError,
    configurationError,
    providers: providers.map(({ apiKeyEnv, headers, ...provider }) => {
      const configured = provider.type === "bedrock"
        ? Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv])
        : Boolean((apiKeyEnv && process.env[apiKeyEnv]) || provider.credentialPool?.ready || provider.allowNoAuth);
      const quarantined = isProviderQuarantined(provider.id);
      const credentialPool = provider.credentialPool;
      return {
        ...provider,
        configured,
        credentialPool,
        expired: isProviderExpired(provider),
        health: runtime.health[provider.id] || { status: "unknown", checkedAt: null },
        lastModelRefresh: runtime.modelCatalog[provider.id]?.refreshedAt || null,
        catalogModelCount: runtime.modelCatalog[provider.id]?.models?.length || 0,
        audit: runtime.audits[provider.id] || null,
        quarantined,
        operations: providerOperations({ ...provider, apiKeyEnv }, { configured, credentialPool, quarantined }),
      };
    }),
    notifications: getGatewayNotifications(),
    lastRefreshAt: runtime.lastRefreshAt,
    supportedProviders: listDedicatedProviderProfiles().map(({ apiKeyEnv, ...profile }) => {
      const configuredProvider = providers.find((provider) => provider.id === profile.id) || null;
      const credentialPool = configuredProvider?.credentialPool || getCredentialPoolStatus(profile.id);
      const discoveredModels = runtime.modelCatalog[profile.id]?.models || configuredProvider?.models || [];
      const configured = profile.localOnly
        ? true
        : Boolean((apiKeyEnv && process.env[apiKeyEnv]) || credentialPool.ready || (profile.oauthClientIdEnv && process.env[profile.oauthClientIdEnv]));
      const status = configured ? "available" : "unavailable";
      const operations = providerOperations({ ...profile, ...configuredProvider, apiKeyEnv: configuredProvider?.apiKeyEnv || apiKeyEnv, enabled: configuredProvider?.enabled ?? true }, { configured, credentialPool, quarantined: configuredProvider ? isProviderQuarantined(profile.id) : false });
      return {
        ...profile,
        credentialPool,
        discoveredModels,
        configured,
        operations,
        status,
        availabilityReason: configured
          ? (profile.localOnly ? "Local endpoint can be tested on this host" : "Credential or runtime configuration detected")
          : (profile.availabilityNote || ((profile.oauthClientIdEnv || profile.oauthOnly) ? "OAuth application configuration is required" : profile.requiresBaseUrl ? "Explicit base URL and credential are required" : `${apiKeyEnv || "Provider credential"} is not configured`)),
        catalogOnly: profile.catalogOnly === true,
        freeTierCatalog: profile.freeTierCatalog === true,
        setupRequired: !configured,
      };
    }),
    features: {
      clientManagedTools: true,
      visionFallback: providers.some((provider) => Boolean(provider.visionProvider)),
      directTrafficInterception: false,
      cookieImport: false,
      mergeOnlyConfigurationImport: true,
      providerHealthChecks: true,
      endpointAudit: true,
      imageGeneration: providers.some((provider) => provider.supportsImageGeneration === true),
      nativeGeminiImage: providers.some((provider) => provider.type === "gemini" && provider.supportsImageGeneration === true),
    },
  };
}

function hasRoutableCredential(provider) {
  if (provider.allowNoAuth === true) return true;
  if (provider.type === "bedrock") return Boolean(provider.region && process.env[provider.accessKeyEnv] && process.env[provider.secretKeyEnv]);
  if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) return true;
  return getCredentialPoolStatus(provider.id).ready > 0;
}

function enabledProviders() {
  return getGatewayProviders().filter((provider) => provider.enabled && !provider.oauthOnly && !isProviderExpired(provider) && !isProviderQuarantined(provider.id) && hasRoutableCredential(provider));
}

export function resolveProvider(model) {
  const providers = enabledProviders();
  if (providers.length === 0) throw new Error("No enabled gateway providers are configured");
  const requested = String(model || "").trim();
  const separatorIndex = requested.indexOf("/");
  const explicitId = separatorIndex > 0 ? requested.slice(0, separatorIndex).toLowerCase() : null;
  const explicitModel = separatorIndex > 0 ? requested.slice(separatorIndex + 1) : requested;
  const provider = explicitId
    ? providers.find((candidate) => candidate.id === explicitId || candidate.prefix === explicitId)
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
      id: `${provider.prefix || provider.id}/${model}`,
      object: "model",
      created: 0,
      owned_by: provider.label || provider.id,
      context_window: metadata[model]?.contextWindow || provider.contextWindow || null,
      pricing: { input_per_million: metadata[model]?.inputCostPerMillion ?? provider.costInputPerMillion, output_per_million: metadata[model]?.outputCostPerMillion ?? provider.costOutputPerMillion },
      routing: { priority: metadata[model]?.routingPriority ?? provider.routingPriority, fallback_providers: provider.fallbackProviders },
      capabilities: {
        tools: metadata[model]?.supportsTools ?? provider.supportsTools,
        vision: metadata[model]?.supportsVision ?? (provider.supportsVision || Boolean(provider.visionProvider)),
        image_generation: metadata[model]?.supportsImageGeneration ?? provider.supportsImageGeneration === true,
      },
      metadata: metadata[model] || {},
    }));
  });
}

export function getProviderConfiguration(providerId) {
  return getProviderSettings(providerId);
}

export const __testables = { normalizeProvider, normalizeBaseUrl, splitModels, normalizeExpiry, isProviderExpired, providerOperations };
