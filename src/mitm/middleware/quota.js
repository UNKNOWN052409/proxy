/**
 * Quota middleware - checks quotas before requests and records usage after
 */

import { quotaStore } from "../../lib/quota/store.js";
import { calculateCost } from "../../lib/providers/pricing.js";
import { err, log } from "../logger.js";

/**
 * Extract account ID from request headers or API key
 * Returns null if no account context found
 */
function extractAccountId(req) {
  // Check for X-Account-Id header (custom header for testing)
  const headerAccountId = req.headers["x-account-id"];
  if (headerAccountId) return headerAccountId;

  // Check for Authorization header with Bearer token
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    // In a real system, you'd decode the JWT or look up the API key
    // For now, use the token itself as account ID
    return auth.slice(7);
  }

  // Default to "anonymous" for tracking
  return "anonymous";
}

/**
 * Extract provider and model information from request
 */
function extractRequestInfo(req, bodyBuffer) {
  const host = req.headers.host || "";
  const path = req.url || "";

  let provider = "unknown";
  let model = "unknown";

  // Detect provider from host
  if (host.includes("kiro.dev") || host.includes("codewhisperer") || host.includes("q.us-east-1")) {
    provider = "kiro";
  } else if (host.includes("anthropic.com")) {
    provider = "anthropic";
  } else if (host.includes("openai.com")) {
    provider = "openai";
  } else if (host.includes("cursor.sh")) {
    provider = "cursor";
  }

  // Try to extract model from request body
  try {
    const body = JSON.parse(bodyBuffer.toString());
    if (body.model) {
      model = body.model;
    }
  } catch {
    // Body not JSON or no model field
  }

  return { provider, model };
}

/**
 * Parse response to extract token usage
 * Handles both streaming SSE and JSON responses
 */
function extractUsageFromResponse(responseText, provider) {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  try {
    // Try parsing as complete JSON response first
    const json = JSON.parse(responseText);
    if (json.usage) {
      usage.inputTokens = json.usage.prompt_tokens || json.usage.input_tokens || 0;
      usage.outputTokens = json.usage.completion_tokens || json.usage.output_tokens || 0;
      usage.totalTokens = json.usage.total_tokens || (usage.inputTokens + usage.outputTokens);
      return usage;
    }
  } catch {
    // Not a complete JSON response, might be SSE stream
  }

  // Parse SSE stream for usage events
  const lines = responseText.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;

    const data = line.slice(5).trim();
    if (data === "[DONE]") continue;

    try {
      const chunk = JSON.parse(data);

      // OpenAI SSE format
      if (chunk.usage) {
        usage.inputTokens = Math.max(usage.inputTokens, chunk.usage.prompt_tokens || 0);
        usage.outputTokens = Math.max(usage.outputTokens, chunk.usage.completion_tokens || 0);
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      }

      // Anthropic SSE format
      if (chunk.type === "message_delta" && chunk.usage) {
        usage.inputTokens = Math.max(usage.inputTokens, chunk.usage.input_tokens || 0);
        usage.outputTokens = Math.max(usage.outputTokens, chunk.usage.output_tokens || 0);
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      }

      // Kiro EventStream format (usageEvent)
      if (chunk.inputTokens !== undefined || chunk.outputTokens !== undefined) {
        usage.inputTokens = Math.max(usage.inputTokens, chunk.inputTokens || 0);
        usage.outputTokens = Math.max(usage.outputTokens, chunk.outputTokens || 0);
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return usage;
}

/**
 * Wrap a handler with quota checking and recording
 *
 * @param {Function} handler - Original handler function (req, res, bodyBuffer, mappedModel)
 * @returns {Function} Wrapped handler with quota enforcement
 */
export function withQuotaTracking(handler) {
  return async function quotaWrappedHandler(req, res, bodyBuffer, mappedModel) {
    const accountId = extractAccountId(req);
    const { provider, model } = extractRequestInfo(req, bodyBuffer);
    const startTime = Date.now();

    // Check quota before allowing request
    const quotaCheck = quotaStore.checkQuota(accountId);

    if (!quotaCheck.allowed) {
      log(`[Quota] Request blocked for account ${accountId}: quota exceeded`);
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Quota exceeded",
          type: "quota_exceeded",
          exceeded: quotaCheck.exceeded,
          usage: quotaCheck.usage,
          limits: quotaCheck.limits,
        },
      }));
      return;
    }

    // Log quota warning for soft policy
    if (quotaCheck.warning) {
      log(`[Quota] Warning for account ${accountId}: ${quotaCheck.warning}`);
    }

    // Capture response for usage extraction
    let responseCapture = "";
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    // Intercept response to capture data for usage tracking
    res.write = function(chunk, ...args) {
      if (chunk) {
        responseCapture += chunk.toString();
      }
      return originalWrite(chunk, ...args);
    };

    res.end = function(chunk, ...args) {
      if (chunk) {
        responseCapture += chunk.toString();
      }

      // Extract usage and record after response completes
      setImmediate(() => {
        try {
          const usage = extractUsageFromResponse(responseCapture, provider);
          const cost = calculateCost(provider, model, usage.inputTokens, usage.outputTokens);
          const duration = Date.now() - startTime;

          // Record usage in quota store
          quotaStore.recordUsage(accountId, {
            requests: 1,
            tokens: usage.totalTokens,
            cost,
          });

          log(`[Quota] Recorded usage for ${accountId}: ${usage.totalTokens} tokens, $${cost.toFixed(4)}, ${duration}ms`);
        } catch (error) {
          err(`[Quota] Failed to record usage: ${error.message}`);
        }
      });

      return originalEnd(chunk, ...args);
    };

    // Call original handler
    try {
      await handler(req, res, bodyBuffer, mappedModel);
    } catch (error) {
      // Restore original methods on error
      res.write = originalWrite;
      res.end = originalEnd;
      throw error;
    }
  };
}

/**
 * Middleware to check quotas without wrapping (for manual integration)
 */
export async function checkQuota(req) {
  const accountId = extractAccountId(req);
  return quotaStore.checkQuota(accountId);
}

/**
 * Middleware to record usage without wrapping (for manual integration)
 */
export function recordUsage(req, tokens, cost) {
  const accountId = extractAccountId(req);
  quotaStore.recordUsage(accountId, { requests: 1, tokens, cost });
}
