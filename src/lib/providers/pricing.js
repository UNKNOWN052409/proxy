/**
 * Provider SKU/Pricing catalog
 * Based on OmniRoute's cost intelligence system
 */

export const providerPricing = {
  // ============ Kiro AI - Free tier ============
  kiro: {
    tier: "free",
    models: {
      "claude-opus-4.8": { input: 0, output: 0, quota: "unlimited" },
      "claude-opus-4.8-thinking": { input: 0, output: 0, quota: "unlimited" },
      "claude-opus-4.8-agentic": { input: 0, output: 0, quota: "unlimited" },
      "claude-sonnet-5": { input: 0, output: 0, quota: "unlimited" },
      "claude-sonnet-4.5": { input: 0, output: 0, quota: "unlimited" },
      "claude-haiku-4.5": { input: 0, output: 0, quota: "unlimited" },
      "deepseek-3.2": { input: 0, output: 0, quota: "unlimited" },
      "gpt-5.6-sol": { input: 0, output: 0, quota: "unlimited" },
      "gpt-5.6-terra": { input: 0, output: 0, quota: "unlimited" },
      "gpt-5.6-luna": { input: 0, output: 0, quota: "unlimited" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ OpenCode - Free tier (UNLIMITED) ============
  opencode: {
    tier: "free",
    models: {
      "deepseek-v4": { input: 0, output: 0, quota: "unlimited" },
      "deepseek-v4-flash": { input: 0, output: 0, quota: "unlimited" },
      "deepseek-v3": { input: 0, output: 0, quota: "unlimited" },
      "qwen2.5-coder-32b": { input: 0, output: 0, quota: "unlimited" },
      "llama-3.3-70b": { input: 0, output: 0, quota: "unlimited" },
    },
    limits: {
      daily: null, // UNLIMITED - no daily limit
      monthly: null,
    },
  },

  // ============ Codex (OpenAI) - OAuth/Subscription ============
  codex: {
    tier: "subscription",
    models: {
      "gpt-5.6-sol": { input: 0, output: 0, quota: "subscription" },
      "gpt-5.6-terra": { input: 0, output: 0, quota: "subscription" },
      "gpt-5.6-luna": { input: 0, output: 0, quota: "subscription" },
      "o4-mini": { input: 0, output: 0, quota: "subscription" },
      "o3": { input: 0, output: 0, quota: "subscription" },
      "gpt-5.7-sol": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Gemini - Free tier with API key ============
  gemini: {
    tier: "free",
    models: {
      "gemini-2.5-pro-exp": { input: 0, output: 0, quota: "15 RPM" },
      "gemini-2.5-flash": { input: 0, output: 0, quota: "15 RPM" },
      "gemini-2.0-flash": { input: 0, output: 0, quota: "15 RPM" },
      "gemini-1.5-pro": { input: 0, output: 0, quota: "2 RPM" },
      "gemini-1.5-flash": { input: 0, output: 0, quota: "15 RPM" },
    },
    limits: {
      daily: 1500,
      monthly: null,
    },
  },

  // ============ GitHub Copilot - Free/Subscription ============
  github: {
    tier: "subscription",
    models: {
      "claude-sonnet-4.5": { input: 0, output: 0, quota: "subscription" },
      "claude-haiku-4.5": { input: 0, output: 0, quota: "subscription" },
      "gpt-4o": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ OpenRouter - Free tier ============
  openrouter: {
    tier: "free",
    models: {
      "deepseek/deepseek-v4-flash": { input: 0, output: 0, quota: "unlimited" },
      "meta-llama/llama-3.3-70b": { input: 0, output: 0, quota: "unlimited" },
      "qwen/qwen2.5-coder-32b": { input: 0, output: 0, quota: "unlimited" },
      "microsoft/phi-3.5-mini": { input: 0, output: 0, quota: "unlimited" },
    },
    limits: {
      daily: 200,
      monthly: null,
    },
  },

  // ============ Antigravity (Google) - OAuth ============
  antigravity: {
    tier: "subscription",
    models: {
      "gemini-2.5-pro": { input: 0, output: 0, quota: "subscription" },
      "gemini-2.5-flash": { input: 0, output: 0, quota: "subscription" },
      "gemini-2.0-flash": { input: 0, output: 0, quota: "subscription" },
      "codegemma-2b": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ xAI Grok - API Key ============
  grok: {
    tier: "paid",
    models: {
      "grok-2-1212": { input: 2.00, output: 10.00, quota: "pay-per-use" },
      "grok-2-vision-1212": { input: 2.00, output: 10.00, quota: "pay-per-use" },
      "grok-beta": { input: 5.00, output: 15.00, quota: "pay-per-use" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Groq - Free tier with generous limits ============
  groq: {
    tier: "free",
    models: {
      "llama-3.3-70b-versatile": { input: 0, output: 0, quota: "14400 RPD" },
      "llama-3.1-70b-versatile": { input: 0, output: 0, quota: "14400 RPD" },
      "mixtral-8x7b-32768": { input: 0, output: 0, quota: "14400 RPD" },
      "gemma2-9b-it": { input: 0, output: 0, quota: "14400 RPD" },
    },
    limits: {
      daily: 14400, // 14,400 requests per day
      monthly: null,
    },
  },

  // ============ DeepSeek - Low cost API ============
  deepseek: {
    tier: "paid",
    models: {
      "deepseek-chat": { input: 0.14, output: 0.28, quota: "pay-per-use" },
      "deepseek-coder": { input: 0.14, output: 0.28, quota: "pay-per-use" },
      "deepseek-reasoner": { input: 0.55, output: 2.19, quota: "pay-per-use" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Qwen (Alibaba Cloud) - Free tier available ============
  qwen: {
    tier: "free",
    models: {
      "qwen-max": { input: 0, output: 0, quota: "free tier" },
      "qwen-plus": { input: 0, output: 0, quota: "free tier" },
      "qwen-turbo": { input: 0, output: 0, quota: "free tier" },
      "qwen2.5-coder-32b": { input: 0, output: 0, quota: "free tier" },
    },
    limits: {
      daily: 1000,
      monthly: null,
    },
  },

  // ============ Perplexity - API Key ============
  perplexity: {
    tier: "paid",
    models: {
      "llama-3.1-sonar-large-128k-online": { input: 1.00, output: 1.00, quota: "pay-per-use" },
      "llama-3.1-sonar-small-128k-online": { input: 0.20, output: 0.20, quota: "pay-per-use" },
      "llama-3.1-sonar-large-128k-chat": { input: 1.00, output: 1.00, quota: "pay-per-use" },
      "llama-3.1-sonar-small-128k-chat": { input: 0.20, output: 0.20, quota: "pay-per-use" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Cohere - API Key ============
  cohere: {
    tier: "paid",
    models: {
      "command-r-plus": { input: 2.50, output: 10.00, quota: "pay-per-use" },
      "command-r": { input: 0.15, output: 0.60, quota: "pay-per-use" },
      "command": { input: 1.00, output: 2.00, quota: "pay-per-use" },
      "command-light": { input: 0.30, output: 0.60, quota: "pay-per-use" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Mistral - API Key ============
  mistral: {
    tier: "paid",
    models: {
      "mistral-large-latest": { input: 2.00, output: 6.00, quota: "pay-per-use" },
      "mistral-medium-latest": { input: 2.70, output: 8.10, quota: "pay-per-use" },
      "mistral-small-latest": { input: 0.20, output: 0.60, quota: "pay-per-use" },
      "codestral-latest": { input: 0.20, output: 0.60, quota: "pay-per-use" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Hugging Face - OAuth Optional ============
  huggingface: {
    tier: "free",
    models: {
      "meta-llama/Llama-3.2-3B-Instruct": { input: 0, output: 0, quota: "free tier (rate limited)" },
      "mistralai/Mistral-7B-Instruct-v0.2": { input: 0, output: 0, quota: "free tier (rate limited)" },
      "microsoft/phi-2": { input: 0, output: 0, quota: "free tier (rate limited)" },
    },
    limits: {
      daily: null, // Rate limited, not count limited
      monthly: null,
    },
  },

  // ============ Ollama - NO AUTH (Local) ============
  ollama: {
    tier: "free",
    models: {
      "llama2": { input: 0, output: 0, quota: "unlimited (local)" },
      "llama3": { input: 0, output: 0, quota: "unlimited (local)" },
      "codellama": { input: 0, output: 0, quota: "unlimited (local)" },
      "mistral": { input: 0, output: 0, quota: "unlimited (local)" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ LM Studio - NO AUTH (Local) ============
  lmstudio: {
    tier: "free",
    models: {
      "local-model": { input: 0, output: 0, quota: "unlimited (local)" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ GitHub Copilot - OAuth + MITM ============
  "github-copilot": {
    tier: "subscription",
    models: {
      "gpt-4": { input: 0, output: 0, quota: "subscription" },
      "gpt-3.5-turbo": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Azure OpenAI - OAuth + MITM ============
  "azure-openai": {
    tier: "subscription",
    models: {
      "gpt-4": { input: 0, output: 0, quota: "subscription" },
      "gpt-4-turbo": { input: 0, output: 0, quota: "subscription" },
      "gpt-35-turbo": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },

  // ============ Google Vertex AI - OAuth + MITM ============
  "vertex-ai": {
    tier: "subscription",
    models: {
      "gemini-2.5-flash": { input: 0, output: 0, quota: "subscription" },
      "gemini-2.5-pro": { input: 0, output: 0, quota: "subscription" },
      "gemini-1.5-pro": { input: 0, output: 0, quota: "subscription" },
    },
    limits: {
      daily: null,
      monthly: null,
    },
  },
};

/**
 * Calculate cost for a request
 * Returns cost in USD (0 for free tier)
 */
export function calculateCost(providerId, modelId, inputTokens, outputTokens) {
  const provider = providerPricing[providerId];
  if (!provider) return 0;

  const model = provider.models[modelId];
  if (!model) return 0;

  // Free tier models return $0
  if (provider.tier === "free" || provider.tier === "subscription") {
    return 0;
  }

  // Calculate cost based on token usage
  const inputCost = (inputTokens / 1000000) * model.input;
  const outputCost = (outputTokens / 1000000) * model.output;

  return inputCost + outputCost;
}

/**
 * Get provider tier
 */
export function getProviderTier(providerId) {
  return providerPricing[providerId]?.tier || "unknown";
}

/**
 * Get model quota information
 */
export function getModelQuota(providerId, modelId) {
  const provider = providerPricing[providerId];
  if (!provider) return null;

  const model = provider.models[modelId];
  if (!model) return null;

  return {
    quota: model.quota,
    dailyLimit: provider.limits.daily,
    monthlyLimit: provider.limits.monthly,
    tier: provider.tier,
  };
}
