/**
 * Provider configuration registry
 * Each provider: id, alias, display, auth type, models, transport config
 */

export const providerConfigs = [
  // ============ Kiro AI ============
  {
    id: "kiro",
    alias: "kr",
    category: "free",
    display: {
      name: "Kiro AI",
      icon: "psychology_alt",
      color: "#5B52F5",
      website: "https://kiro.dev",
    },
    authMethods: ["oauth", "api_key", "device_code"],
    transport: {
      baseUrl: "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
      baseUrls: [
        "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
        "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
        "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
      ],
      format: "kiro",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.amazon.eventstream",
        "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
        "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
        "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
      },
    },
    models: [
      { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
      { id: "claude-opus-4.8-thinking", name: "Claude Opus 4.8 (Thinking)" },
      { id: "claude-opus-4.8-agentic", name: "Claude Opus 4.8 (Agentic)" },
      { id: "claude-opus-4.8-thinking-agentic", name: "Claude Opus 4.8 (Thinking+Agentic)" },
      { id: "claude-opus-4.7", name: "Claude Opus 4.7" },
      { id: "claude-opus-4.7-thinking", name: "Claude Opus 4.7 (Thinking)" },
      { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
      { id: "claude-opus-4.5-thinking", name: "Claude Opus 4.5 (Thinking)" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "claude-sonnet-5-thinking", name: "Claude Sonnet 5 (Thinking)" },
      { id: "claude-sonnet-4.5-thinking", name: "Claude Sonnet 4.5 (Thinking)" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
      { id: "claude-haiku-4.5-thinking", name: "Claude Haiku 4.5 (Thinking)" },
      { id: "deepseek-3.2", name: "DeepSeek 3.2" },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
      { id: "glm-5", name: "GLM 5" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", contextLength: 272000 },
      { id: "gpt-5.6-terra", name: "GPT 5.6 Terra", contextLength: 272000 },
      { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", contextLength: 272000 },
    ],
  },

  // ============ OpenCode Free ============
  {
    id: "opencode",
    alias: "oc",
    category: "free",
    noAuth: true,
    display: {
      name: "OpenCode Free",
      icon: "terminal",
      color: "#E87040",
      website: "https://opencode.ai",
    },
    authMethods: ["none"],
    transport: {
      baseUrl: "https://opencode.ai/zen/v1/chat/completions",
      noAuth: true,
      format: "openai",
      headers: { "x-opencode-client": "desktop" },
    },
    models: [
      { id: "deepseek-v4", name: "DeepSeek V4" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash (Free)" },
      { id: "deepseek-v3", name: "DeepSeek V3" },
      { id: "qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B" },
      { id: "qwen2.5-coder-14b", name: "Qwen 2.5 Coder 14B" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B" },
    ],
  },

  // ============ Codex (OpenAI) ============
  {
    id: "codex",
    alias: "cx",
    category: "oauth",
    display: {
      name: "OpenAI Codex",
      icon: "code",
      color: "#3B82F6",
      website: "https://chatgpt.com/codex",
    },
    authMethods: ["oauth", "session"],
    transport: {
      baseUrl: "https://chatgpt.com/backend-api/codex/responses",
      format: "openai-responses",
      headers: { originator: "codex_cli_rs", "User-Agent": "codex_cli_rs/0.136.0" },
    },
    models: [
      { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", contextLength: 272000 },
      { id: "gpt-5.6-terra", name: "GPT 5.6 Terra", contextLength: 272000 },
      { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", contextLength: 272000 },
      { id: "o4-mini", name: "O4 Mini" },
      { id: "o3", name: "O3" },
      { id: "gpt-5.7-sol", name: "GPT 5.7 Sol", contextLength: 540000 },
    ],
  },

  // ============ Antigravity (Google) ============
  {
    id: "antigravity",
    alias: "ag",
    category: "oauth",
    display: {
      name: "Antigravity",
      icon: "rocket_launch",
      color: "#F59E0B",
      website: "https://antigravity.google",
    },
    authMethods: ["oauth"],
    transport: {
      baseUrl: "https://us-central1-aiplatform.cloudcode-pa.googleapis.com",
      format: "antigravity",
      headers: { "User-Agent": "CloudCode/1.0 google-cloud-code-ide/1.0" },
    },
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "codegemma-2b", name: "CodeGemma 2B" },
    ],
  },

  // ============ Gemini Free ============
  {
    id: "gemini",
    alias: "gm",
    category: "free",
    display: {
      name: "Gemini Free",
      icon: "auto_awesome",
      color: "#4285F4",
      website: "https://ai.google.dev",
    },
    authMethods: ["api_key"],
    transport: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      format: "gemini",
    },
    models: [
      { id: "gemini-2.5-pro-exp", name: "Gemini 2.5 Pro (Experimental)" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    ],
  },

  // ============ GitHub Copilot Free ============
  {
    id: "github",
    alias: "gh",
    category: "free",
    display: {
      name: "GitHub Copilot",
      icon: "rocket",
      color: "#8957E5",
      website: "https://github.com/features/copilot",
    },
    authMethods: ["oauth"],
    transport: {
      baseUrl: "https://api.githubcopilot.com",
      format: "openai",
      headers: { "Editor-Version": "vscode/1.96.0", "Editor-Plugin-Version": "copilot/1.96.0" },
    },
    models: [
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
      { id: "gpt-4o", name: "GPT-4o" },
    ],
  },

  // ============ OpenRouter Free ============
  {
    id: "openrouter",
    alias: "or",
    category: "free",
    display: {
      name: "OpenRouter Free",
      icon: "alt_route",
      color: "#FF8C00",
      website: "https://openrouter.ai",
    },
    authMethods: ["api_key"],
    transport: {
      baseUrl: "https://openrouter.ai/api/v1",
      format: "openai",
      headers: { "HTTP-Referer": "https://kiro-proxy.local" },
    },
    models: [
      { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash (Free)" },
      { id: "meta-llama/llama-3.3-70b", name: "Llama 3.3 70B" },
      { id: "qwen/qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B" },
      { id: "microsoft/phi-3.5-mini", name: "Phi 3.5 Mini" },
    ],
  },
];
