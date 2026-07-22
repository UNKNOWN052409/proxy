/**
 * Kiro AI Provider Configuration
 * Based on 9router's kiro provider registry with all models and auth endpoints
 */

export const KIRO_CONFIG = {
  id: "kiro",
  alias: "kr",
  display: {
    name: "Kiro AI",
    icon: "psychology_alt",
    color: "#5B52F5",
    website: "https://kiro.dev",
  },
  category: "free",
  transport: {
    baseUrl: "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
    baseUrls: [
      "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
      "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    ],
    format: "kiro",
    retry: { "429": 0 },
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/vnd.amazon.eventstream",
      "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
      "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
      "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
    },
    tokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    authUrl: "https://prod.us-east-1.auth.desktop.kiro.dev",
    usage: {
      cwHost: "https://codewhisperer.us-east-1.amazonaws.com",
      qHost: "https://q.us-east-1.amazonaws.com",
      limitsPath: "/getUsageLimits",
    },
  },
  oauth: {
    ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
    registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
    deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
    tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
    startUrl: "https://view.awsapps.com/start",
    clientName: "kiro-oauth-client",
    clientType: "public",
    scopes: ["codewhisperer:completions", "codewhisperer:analysis", "codewhisperer:conversations"],
    grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
    socialAuthEndpoint: "https://prod.us-east-1.auth.desktop.kiro.dev",
    socialLoginUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/login",
    socialTokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
    socialRefreshUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    authMethods: ["builder-id", "idc", "google", "github", "import", "api_key", "external_idp"],
  },
};

export const KIRO_MODELS = [
  // Opus
  { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
  { id: "claude-opus-4.8-thinking", name: "Claude Opus 4.8 (Thinking)" },
  { id: "claude-opus-4.8-agentic", name: "Claude Opus 4.8 (Agentic)" },
  { id: "claude-opus-4.8-thinking-agentic", name: "Claude Opus 4.8 (Thinking + Agentic)" },
  { id: "claude-opus-4.7", name: "Claude Opus 4.7" },
  { id: "claude-opus-4.7-thinking", name: "Claude Opus 4.7 (Thinking)" },
  { id: "claude-opus-4.7-agentic", name: "Claude Opus 4.7 (Agentic)" },
  { id: "claude-opus-4.7-thinking-agentic", name: "Claude Opus 4.7 (Thinking + Agentic)" },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
  { id: "claude-opus-4.5-thinking", name: "Claude Opus 4.5 (Thinking)" },
  { id: "claude-opus-4.5-agentic", name: "Claude Opus 4.5 (Agentic)" },
  { id: "claude-opus-4.5-thinking-agentic", name: "Claude Opus 4.5 (Thinking + Agentic)" },
  // Sonnet
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "claude-sonnet-5-thinking", name: "Claude Sonnet 5 (Thinking)" },
  { id: "claude-sonnet-4.5-thinking", name: "Claude Sonnet 4.5 (Thinking)" },
  { id: "claude-sonnet-5-agentic", name: "Claude Sonnet 5 (Agentic)" },
  { id: "claude-sonnet-4.5-agentic", name: "Claude Sonnet 4.5 (Agentic)" },
  { id: "claude-sonnet-5-thinking-agentic", name: "Claude Sonnet 5 (Thinking + Agentic)" },
  { id: "claude-sonnet-4.5-thinking-agentic", name: "Claude Sonnet 4.5 (Thinking + Agentic)" },
  // Haiku
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "claude-haiku-4.5-thinking", name: "Claude Haiku 4.5 (Thinking)" },
  { id: "claude-haiku-4.5-agentic", name: "Claude Haiku 4.5 (Agentic)" },
  { id: "claude-haiku-4.5-thinking-agentic", name: "Claude Haiku 4.5 (Thinking + Agentic)" },
  // Non-Anthropic
  { id: "deepseek-3.2", name: "DeepSeek 3.2", strip: ["image", "audio"] },
  { id: "qwen3-coder-next", name: "Qwen3 Coder Next", strip: ["image", "audio"] },
  { id: "glm-5", name: "GLM 5" },
  { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
  // GPT-5.6 variants
  { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", contextLength: 272000, rateMultiplier: 2.4, upstreamModelId: "gpt-5.6-sol", description: "Experimental preview of OpenAI GPT 5.6 Sol with 272k context window" },
  { id: "gpt-5.6-terra", name: "GPT 5.6 Terra", contextLength: 272000, rateMultiplier: 1.2, upstreamModelId: "gpt-5.6-terra", description: "Experimental preview of OpenAI GPT 5.6 Terra with 272k context window" },
  { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", contextLength: 272000, rateMultiplier: 0.6, upstreamModelId: "gpt-5.6-luna", description: "Experimental preview of OpenAI GPT 5.6 Luna with 272k context window" },
  { id: "gpt-5.6-sol-thinking", name: "GPT 5.6 Sol (Thinking)", contextLength: 272000, rateMultiplier: 2.4, upstreamModelId: "gpt-5.6-sol" },
  { id: "gpt-5.6-terra-thinking", name: "GPT 5.6 Terra (Thinking)", contextLength: 272000, rateMultiplier: 1.2, upstreamModelId: "gpt-5.6-terra" },
  { id: "gpt-5.6-luna-thinking", name: "GPT 5.6 Luna (Thinking)", contextLength: 272000, rateMultiplier: 0.6, upstreamModelId: "gpt-5.6-luna" },
  { id: "gpt-5.6-sol-agentic", name: "GPT 5.6 Sol (Agentic)", contextLength: 272000, rateMultiplier: 2.4, upstreamModelId: "gpt-5.6-sol" },
  { id: "gpt-5.6-terra-agentic", name: "GPT 5.6 Terra (Agentic)", contextLength: 272000, rateMultiplier: 1.2, upstreamModelId: "gpt-5.6-terra" },
  { id: "gpt-5.6-luna-agentic", name: "GPT 5.6 Luna (Agentic)", contextLength: 272000, rateMultiplier: 0.6, upstreamModelId: "gpt-5.6-luna" },
  { id: "gpt-5.6-sol-thinking-agentic", name: "GPT 5.6 Sol (Thinking + Agentic)", contextLength: 272000, rateMultiplier: 2.4, upstreamModelId: "gpt-5.6-sol" },
  { id: "gpt-5.6-terra-thinking-agentic", name: "GPT 5.6 Terra (Thinking + Agentic)", contextLength: 272000, rateMultiplier: 1.2, upstreamModelId: "gpt-5.6-terra" },
  { id: "gpt-5.6-luna-thinking-agentic", name: "GPT 5.6 Luna (Thinking + Agentic)", contextLength: 272000, rateMultiplier: 0.6, upstreamModelId: "gpt-5.6-luna" },
];

export const KIRO_AUTH_SERVICE = "https://prod.us-east-1.auth.desktop.kiro.dev";

export function resolveKiroModel(modelId) {
  const model = KIRO_MODELS.find(m => m.id === modelId);
  return model || null;
}

export function getKiroModels() {
  return KIRO_MODELS;
}
