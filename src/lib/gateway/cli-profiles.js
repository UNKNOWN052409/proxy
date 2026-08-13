const PROFILES = Object.freeze({
  "pi-mono": { id: "pi-mono", label: "Pi Mono", protocol: "openai", supportsTools: true, supportsVision: false },
  prime: { id: "prime", label: "Prime", protocol: "openai", supportsTools: true, supportsVision: false },
  claude: { id: "claude", label: "Claude", protocol: "anthropic", supportsTools: true, supportsVision: true },
  codex: { id: "codex", label: "Codex-compatible", protocol: "openai", supportsTools: true, supportsVision: false },
  opencode: { id: "opencode", label: "OpenCode local", protocol: "openai", supportsTools: true, supportsVision: false, localOnly: true },
  gemini: { id: "gemini", label: "Gemini-compatible", protocol: "openai", supportsTools: true, supportsVision: true },
  qwen: { id: "qwen", label: "Qwen-compatible", protocol: "openai", supportsTools: true, supportsVision: true },
  kimi: { id: "kimi", label: "Kimi-compatible", protocol: "openai", supportsTools: true, supportsVision: true },
  grok: { id: "grok", label: "Grok-compatible", protocol: "openai", supportsTools: true, supportsVision: true },
  jcode: { id: "jcode", label: "JCode-compatible", protocol: "openai", supportsTools: true, supportsVision: false },
  custom: { id: "custom", label: "Custom OpenAI-compatible", protocol: "openai", supportsTools: false, supportsVision: false },
});

function cleanUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("baseUrl is required");
  const url = new URL(value.trim());
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) throw new Error("baseUrl must use HTTPS unless it is loopback");
  url.username = "";
  url.password = "";
  return url.toString().replace(/\/$/, "");
}

function listProfiles() { return Object.values(PROFILES).map(({ id, label, protocol, supportsTools, supportsVision, localOnly }) => ({ id, label, protocol, supportsTools, supportsVision, localOnly: Boolean(localOnly) })); }

function getProfile(id) {
  const profile = PROFILES[String(id || "custom").toLowerCase()];
  if (!profile) throw new Error(`Unsupported profile: ${id}`);
  return { ...profile };
}

function buildConnection({ profileId = "custom", baseUrl, model = null, apiKeyEnv = null, gatewayUrl = null } = {}) {
  const profile = getProfile(profileId);
  const normalizedBaseUrl = cleanUrl(baseUrl || gatewayUrl || "http://127.0.0.1:20127/v1");
  if (profile.localOnly && !["localhost", "127.0.0.1", "::1"].includes(new URL(normalizedBaseUrl).hostname)) throw new Error("The OpenCode profile is restricted to local/private configuration");
  return {
    profile: profile.id,
    label: profile.label,
    protocol: profile.protocol,
    baseUrl: normalizedBaseUrl,
    model: model || null,
    apiKeyEnv: apiKeyEnv || "GATEWAY_API_KEY",
    authHeader: "Authorization: Bearer $GATEWAY_API_KEY",
    supportsTools: profile.supportsTools,
    supportsVision: profile.supportsVision,
    safeBoundary: "No cookies, browser sessions, password extraction, or undocumented OAuth import.",
  };
}

export { buildConnection, getProfile, listProfiles, cleanUrl, PROFILES };
export const __testables = { buildConnection, getProfile, listProfiles, cleanUrl };
