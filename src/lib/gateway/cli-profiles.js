const PROFILES = Object.freeze({
  "pi-mono": { id: "pi-mono", label: "Pi Mono", protocol: "openai", format: "env", fileName: ".env.gateway", supportsTools: true, supportsVision: false, install: "Set the generated environment variables in the Pi Mono shell or launcher." },
  prime: { id: "prime", label: "Prime", protocol: "openai", format: "env", fileName: ".env.gateway", supportsTools: true, supportsVision: false, install: "Set the generated environment variables in the Prime CLI environment." },
  claude: { id: "claude", label: "Claude Code CLI", protocol: "anthropic", format: "env", fileName: ".env.claude-gateway", supportsTools: true, supportsVision: true, envBase: "ANTHROPIC_BASE_URL", envKey: "ANTHROPIC_API_KEY", install: "Source the generated environment file before starting Claude Code." },
  codex: { id: "codex", label: "Codex CLI", protocol: "openai", format: "toml", fileName: "~/.codex/config.toml", supportsTools: true, supportsVision: false, install: "Merge the generated TOML into ~/.codex/config.toml; keep the API key in CODEX_API_KEY." },
  opencode: { id: "opencode", label: "OpenCode", protocol: "openai", format: "json", fileName: "opencode.json", supportsTools: true, supportsVision: false, localOnly: true, install: "Save opencode.json in the project directory. Use OpenCode /connect for its own credential storage." },
  gemini: { id: "gemini", label: "Gemini CLI", protocol: "openai", format: "env", fileName: ".env.gemini-gateway", supportsTools: true, supportsVision: true, install: "Export the generated gateway variables before starting Gemini CLI; verify the installed CLI version's custom endpoint support." },
  qwen: { id: "qwen", label: "Qwen CLI", protocol: "openai", format: "env", fileName: ".env.qwen-gateway", supportsTools: true, supportsVision: true, install: "Export the generated OpenAI-compatible variables before starting Qwen Code." },
  kimi: { id: "kimi", label: "Kimi CLI", protocol: "openai", format: "env", fileName: ".env.kimi-gateway", supportsTools: true, supportsVision: true, install: "Use the documented API-key/API-source setup in Kimi CLI, with the generated endpoint where supported." },
  grok: { id: "grok", label: "Grok CLI", protocol: "openai", format: "env", fileName: ".env.grok-gateway", supportsTools: true, supportsVision: true, install: "Export the generated OpenAI-compatible variables before launching the authorized Grok client." },
  jcode: { id: "jcode", label: "JCode CLI", protocol: "openai", format: "env", fileName: ".env.jcode-gateway", supportsTools: true, supportsVision: false, install: "Export the generated OpenAI-compatible variables; custom endpoint support depends on the installed JCode version." },
  custom: { id: "custom", label: "Custom CLI", protocol: "openai", format: "env", fileName: ".env.gateway", supportsTools: false, supportsVision: false, install: "Map the generated OPENAI_BASE_URL and OPENAI_API_KEY variables to the custom CLI's documented options." },
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

function listProfiles() { return Object.values(PROFILES).map(({ id, label, protocol, format, fileName, supportsTools, supportsVision, localOnly }) => ({ id, label, protocol, format, fileName, supportsTools, supportsVision, localOnly: Boolean(localOnly) })); }
function getProfile(id) { const profile = PROFILES[String(id || "custom").toLowerCase()]; if (!profile) throw new Error(`Unsupported profile: ${id}`); return { ...profile }; }
function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

function buildSetup({ profileId = "custom", baseUrl, model = null, gatewayUrl = null } = {}) {
  const profile = getProfile(profileId);
  const normalizedBaseUrl = cleanUrl(baseUrl || gatewayUrl || "http://127.0.0.1:20127/v1");
  if (profile.localOnly && !["localhost", "127.0.0.1", "::1"].includes(new URL(normalizedBaseUrl).hostname)) throw new Error("The OpenCode profile is restricted to local/private configuration");
  const selectedModel = model || "provider/model-id";
  const env = {
    OPENAI_BASE_URL: normalizedBaseUrl,
    OPENAI_API_KEY: "$GATEWAY_API_KEY",
    GATEWAY_MODEL: selectedModel,
  };
  let content;
  if (profile.format === "json") {
    content = JSON.stringify({ "$schema": "https://opencode.ai/config.json", provider: { gateway: { options: { baseURL: normalizedBaseUrl }, models: { [selectedModel]: { name: selectedModel } } } } }, null, 2);
  } else if (profile.format === "toml") {
    content = `model = ${JSON.stringify(selectedModel)}\nmodel_provider = "gateway"\n\n[model_providers.gateway]\nname = "gateway"\nbase_url = ${JSON.stringify(normalizedBaseUrl)}\nwire_api = "responses"\n`;
  } else {
    const baseName = profile.envBase || "OPENAI_BASE_URL";
    const keyName = profile.envKey || "OPENAI_API_KEY";
    content = `${baseName}=${normalizedBaseUrl}\n${keyName}=$GATEWAY_API_KEY\nOPENAI_BASE_URL=${normalizedBaseUrl}\nOPENAI_API_KEY=$GATEWAY_API_KEY\nGATEWAY_MODEL=${selectedModel}\n`;
  }
  return {
    profile: profile.id, label: profile.label, format: profile.format, fileName: profile.fileName,
    protocol: profile.protocol, baseUrl: normalizedBaseUrl, model: model || null,
    authHeader: "Authorization: Bearer $GATEWAY_API_KEY",
    apiKeyEnv: profile.envKey || "OPENAI_API_KEY",
    content, env, install: profile.install,
    command: `export GATEWAY_API_KEY='<your-gateway-key>' && ${Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`).join(" && ")}`,
    supportsTools: profile.supportsTools, supportsVision: profile.supportsVision,
    safeBoundary: "No cookies, browser sessions, password extraction, or undocumented OAuth import.",
  };
}

function buildConnection(options = {}) { return buildSetup(options); }
export { buildConnection, buildSetup, getProfile, listProfiles, cleanUrl, PROFILES };
export const __testables = { buildConnection, buildSetup, getProfile, listProfiles, cleanUrl };
