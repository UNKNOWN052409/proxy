/**
 * Centralized request routing - detects provider type and routes to appropriate handler
 */

import { intercept as kiroIntercept } from "./handlers/kiro.js";
import { intercept as anthropicIntercept } from "./handlers/anthropic.js";
import { intercept as openaiIntercept } from "./handlers/openai.js";
import { intercept as cursorIntercept } from "./handlers/cursor.js";
import { intercept as grokIntercept } from "./handlers/grok.js";
import { intercept as groqIntercept } from "./handlers/groq.js";
import { intercept as deepseekIntercept } from "./handlers/deepseek.js";
import { intercept as qwenIntercept } from "./handlers/qwen.js";
import { intercept as perplexityIntercept } from "./handlers/perplexity.js";
import { intercept as cohereIntercept } from "./handlers/cohere.js";
import { intercept as mistralIntercept } from "./handlers/mistral.js";
import { intercept as huggingfaceIntercept } from "./handlers/huggingface.js";
import { intercept as ollamaIntercept } from "./handlers/ollama.js";
import { intercept as lmstudioIntercept } from "./handlers/lmstudio.js";
import { intercept as githubCopilotIntercept } from "./handlers/github-copilot.js";
import { intercept as azureOpenaiIntercept } from "./handlers/azure-openai.js";
import { intercept as vertexAiIntercept } from "./handlers/vertex-ai.js";
import { log } from "./logger.js";

/**
 * Provider detection patterns
 */
const PROVIDER_PATTERNS = {
  kiro: {
    hosts: [
      "runtime.us-east-1.kiro.dev",
      "codewhisperer.us-east-1.amazonaws.com",
      "q.us-east-1.amazonaws.com",
    ],
    paths: ["/v1/chat/completions", "/v1/completions"],
  },
  anthropic: {
    hosts: ["api.anthropic.com"],
    paths: ["/v1/messages", "/v1/complete"],
  },
  openai: {
    hosts: ["api.openai.com"],
    paths: ["/v1/chat/completions", "/v1/completions", "/v1/embeddings"],
  },
  cursor: {
    hosts: ["api.cursor.sh", "cursor.sh"],
    paths: ["/v1/chat/completions", "/aiserver.v1"],
  },
  grok: {
    hosts: ["api.x.ai"],
    paths: ["/v1/chat/completions"],
  },
  groq: {
    hosts: ["api.groq.com"],
    paths: ["/openai/v1/chat/completions"],
  },
  deepseek: {
    hosts: ["api.deepseek.com"],
    paths: ["/v1/chat/completions"],
  },
  qwen: {
    hosts: ["dashscope.aliyuncs.com"],
    paths: ["/compatible-mode/v1/chat/completions"],
  },
  perplexity: {
    hosts: ["api.perplexity.ai"],
    paths: ["/chat/completions"],
  },
  cohere: {
    hosts: ["api.cohere.ai", "api.cohere.com"],
    paths: ["/v1/chat", "/v1/generate"],
  },
  mistral: {
    hosts: ["api.mistral.ai"],
    paths: ["/v1/chat/completions"],
  },
  huggingface: {
    hosts: ["api-inference.huggingface.co"],
    paths: ["/models/"],
  },
  ollama: {
    hosts: ["localhost:11434", "127.0.0.1:11434"],
    paths: ["/api/chat", "/api/generate"],
  },
  lmstudio: {
    hosts: ["localhost:1234", "127.0.0.1:1234"],
    paths: ["/v1/chat/completions"],
  },
  "github-copilot": {
    hosts: ["api.githubcopilot.com"],
    paths: ["/chat/completions"],
  },
  "azure-openai": {
    hosts: [".openai.azure.com"],
    paths: ["/openai/deployments/"],
  },
  "vertex-ai": {
    hosts: ["-aiplatform.googleapis.com"],
    paths: ["/v1/projects/"],
  },
};

/**
 * Detect provider type from request
 *
 * @param {http.IncomingMessage} req - HTTP request
 * @param {Buffer} bodyBuffer - Request body
 * @returns {string} Provider ID (kiro, anthropic, openai, cursor, unknown)
 */
export function detectProvider(req, bodyBuffer) {
  const host = (req.headers.host || "").toLowerCase();
  const path = (req.url || "").toLowerCase();

  // Check each provider's patterns
  for (const [providerId, patterns] of Object.entries(PROVIDER_PATTERNS)) {
    // Check host match
    const hostMatch = patterns.hosts.some(h => host.includes(h));
    if (hostMatch) {
      log(`[Router] Detected provider ${providerId} from host: ${host}`);
      return providerId;
    }
  }

  // Fallback: detect from request body structure
  try {
    const body = JSON.parse(bodyBuffer.toString());

    // Anthropic-specific fields
    if (body.anthropic_version || body.system || (body.messages && body.max_tokens)) {
      log(`[Router] Detected provider anthropic from body structure`);
      return "anthropic";
    }

    // Cursor-specific fields
    if (body.cursorContext || body.workspaceContext || body.includeAIBlock) {
      log(`[Router] Detected provider cursor from body structure`);
      return "cursor";
    }

    // Kiro/CodeWhisperer-specific fields
    if (body.conversationState || body.userInputMessage) {
      log(`[Router] Detected provider kiro from body structure`);
      return "kiro";
    }

    // OpenAI is most generic, so it's the fallback
    if (body.messages || body.prompt) {
      log(`[Router] Detected provider openai from body structure (fallback)`);
      return "openai";
    }
  } catch {
    // Not JSON or parsing failed, can't detect from body
  }

  log(`[Router] Could not detect provider for host ${host}, path ${path}`);
  return "unknown";
}

/**
 * Get handler for a provider type
 *
 * @param {string} providerId - Provider ID (kiro, anthropic, openai, cursor)
 * @returns {Function|null} Handler function or null if unknown
 */
export function getHandler(providerId) {
  const handlers = {
    kiro: kiroIntercept,
    anthropic: anthropicIntercept,
    openai: openaiIntercept,
    cursor: cursorIntercept,
    grok: grokIntercept,
    groq: groqIntercept,
    deepseek: deepseekIntercept,
    qwen: qwenIntercept,
    perplexity: perplexityIntercept,
    cohere: cohereIntercept,
    mistral: mistralIntercept,
    huggingface: huggingfaceIntercept,
    ollama: ollamaIntercept,
    lmstudio: lmstudioIntercept,
    "github-copilot": githubCopilotIntercept,
    "azure-openai": azureOpenaiIntercept,
    "vertex-ai": vertexAiIntercept,
  };

  return handlers[providerId] || null;
}

/**
 * Route request to appropriate handler
 *
 * @param {http.IncomingMessage} req - HTTP request
 * @param {http.ServerResponse} res - HTTP response
 * @param {Buffer} bodyBuffer - Request body
 * @param {string} mappedModel - Mapped model name (optional)
 * @returns {Promise<void>}
 */
export async function routeRequest(req, res, bodyBuffer, mappedModel = null) {
  const providerId = detectProvider(req, bodyBuffer);

  if (providerId === "unknown") {
    log(`[Router] Unknown provider, rejecting request`);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message: "Could not detect API provider from request",
        type: "routing_error",
      },
    }));
    return;
  }

  const handler = getHandler(providerId);

  if (!handler) {
    log(`[Router] No handler available for provider ${providerId}`);
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message: `Handler not implemented for provider: ${providerId}`,
        type: "routing_error",
      },
    }));
    return;
  }

  log(`[Router] Routing to ${providerId} handler`);
  await handler(req, res, bodyBuffer, mappedModel);
}

/**
 * Check if a request should be routed through MITM handlers
 *
 * @param {string} host - Request host
 * @param {string} path - Request path
 * @returns {boolean}
 */
export function shouldIntercept(host, path) {
  // Check if host matches any known provider
  for (const patterns of Object.values(PROVIDER_PATTERNS)) {
    const hostMatch = patterns.hosts.some(h => host.includes(h));
    if (hostMatch) {
      return true;
    }
  }

  return false;
}
