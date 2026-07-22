/**
 * Security middleware - rate limiting, request distribution, ban detection, UA rotation
 */

import {
  rateLimiter,
  requestDistributor,
  banDetector,
  getRandomUserAgent,
  addJitter,
  generateRequestId,
} from "../../lib/security/anti-ban.js";
import { accountStore } from "../../lib/accounts/store.js";
import { err, log } from "../logger.js";
import { enqueueRequest } from "./security-queue.js";

/**
 * Detect provider from request
 */
function detectProvider(req) {
  const host = req.headers.host || "";
  const path = req.url || "";

  if (host.includes("kiro.dev") || host.includes("codewhisperer") || host.includes("q.us-east-1")) {
    return "kiro";
  } else if (host.includes("anthropic.com")) {
    return "anthropic";
  } else if (host.includes("openai.com")) {
    return "openai";
  } else if (host.includes("cursor.sh")) {
    return "cursor";
  } else if (host.includes("api.x.ai")) {
    return "grok";
  } else if (host.includes("api.groq.com")) {
    return "groq";
  } else if (host.includes("api.deepseek.com")) {
    return "deepseek";
  } else if (host.includes("dashscope.aliyuncs.com")) {
    return "qwen";
  } else if (host.includes("api.perplexity.ai")) {
    return "perplexity";
  } else if (host.includes("api.cohere.ai") || host.includes("api.cohere.com")) {
    return "cohere";
  } else if (host.includes("api.mistral.ai")) {
    return "mistral";
  } else if (host.includes("api-inference.huggingface.co")) {
    return "huggingface";
  } else if (host.includes("localhost:11434") || host.includes("127.0.0.1:11434")) {
    return "ollama";
  } else if (host.includes("localhost:1234") || host.includes("127.0.0.1:1234")) {
    return "lmstudio";
  } else if (host.includes("api.githubcopilot.com")) {
    return "github-copilot";
  } else if (host.includes(".openai.azure.com")) {
    return "azure-openai";
  } else if (host.includes("-aiplatform.googleapis.com")) {
    return "vertex-ai";
  }

  return "unknown";
}

/**
 * Wrap a handler with security features
 *
 * @param {Function} handler - Original handler function
 * @returns {Function} Wrapped handler with security features
 */
export function withSecurity(handler) {
  return async function securityWrappedHandler(req, res, bodyBuffer, mappedModel) {
    const providerId = detectProvider(req);
    const requestId = generateRequestId();

    // Add request ID to headers for tracing
    req.headers["x-request-id"] = requestId;

    // 1. Check rate limits
    const rateLimits = {
      rpm: 60, // 60 requests per minute
      rph: 3600, // 3600 requests per hour
      rpd: 10000, // 10000 requests per day
    };
    const rateCheck = rateLimiter.checkLimit(providerId, rateLimits);

    // If rate limit exceeded, enqueue request instead of blocking
    if (!rateCheck.allowed) {
      log(`[Security] Rate limit hit for ${providerId}, enqueueing request`);

      // Get current request count in last minute for delay calculation
      const window = rateLimiter.windows.get(providerId);
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const requestsInLastMinute = window
        ? window.requests.filter(t => t > oneMinuteAgo).length
        : 0;

      // Enqueue request with priority based on user tier
      // This will process slowly to respect rate limits
      await enqueueRequest(
        providerId,
        handler,
        req,
        res,
        bodyBuffer,
        mappedModel,
        requestsInLastMinute
      );
      return;
    }

    // 2. Select best account for this request (load balancing)
    const accounts = accountStore.list({ provider: providerId });
    const selectedAccount = requestDistributor.selectAccount(accounts, providerId);

    if (selectedAccount) {
      // Check if account is banned
      if (banDetector.isBanned(selectedAccount.id)) {
        log(`[Security] Account ${selectedAccount.id} is banned, selecting another`);
        // Try to find a non-banned account
        const nonBannedAccounts = accounts.filter(a => !banDetector.isBanned(a.id));
        if (nonBannedAccounts.length > 0) {
          const fallbackAccount = requestDistributor.selectAccount(nonBannedAccounts, providerId);
          if (fallbackAccount) {
            requestDistributor.recordUsage(fallbackAccount.id);
            req.headers["x-selected-account"] = fallbackAccount.id;
          }
        }
      } else {
        requestDistributor.recordUsage(selectedAccount.id);
        req.headers["x-selected-account"] = selectedAccount.id;
        log(`[Security] Selected account ${selectedAccount.id} for ${providerId}`);
      }
    }

    // 3. Add random User-Agent to prevent fingerprinting
    const clientType = detectClientType(req);
    req.headers["user-agent"] = getRandomUserAgent(clientType);

    // 4. Add jitter to request timing (helps avoid detection patterns)
    const jitter = addJitter(0, 200); // 0-200ms random delay
    if (jitter > 0) {
      await new Promise(resolve => setTimeout(resolve, jitter));
    }

    // 5. Record rate limit usage
    rateLimiter.recordRequest(providerId);

    // Track response for failure detection
    const originalWriteHead = res.writeHead.bind(res);
    let statusCode = 200;

    res.writeHead = function(code, ...args) {
      statusCode = code;
      return originalWriteHead(code, ...args);
    };

    // Call original handler
    try {
      await handler(req, res, bodyBuffer, mappedModel);

      // Record failure if status code indicates problem
      if (statusCode >= 400 && selectedAccount) {
        const errorMessage = statusCode === 429 ? "rate_limit" :
                            statusCode === 403 ? "forbidden" : "error";
        banDetector.recordFailure(selectedAccount.id, statusCode, errorMessage);
        log(`[Security] Recorded failure for account ${selectedAccount.id}: ${statusCode}`);
      }
    } catch (error) {
      // Record failure on exception
      if (selectedAccount) {
        banDetector.recordFailure(selectedAccount.id, 500, error.message);
      }
      throw error;
    }
  };
}

/**
 * Detect client type from request headers
 */
function detectClientType(req) {
  const ua = req.headers["user-agent"] || "";

  if (ua.includes("Cursor")) return "cursor";
  if (ua.includes("Cline")) return "cline";
  if (ua.includes("Claude-Code")) return "claude";
  if (ua.includes("codex")) return "codex";

  return "vscode"; // Default
}

/**
 * Manual security check (for non-wrapped usage)
 */
export async function checkSecurity(req) {
  const providerId = detectProvider(req);

  // Check rate limits
  const rateCheck = rateLimiter.checkLimit(providerId);
  if (!rateCheck.allowed) {
    return { allowed: false, reason: rateCheck.reason, retryAfter: rateCheck.retryAfter };
  }

  // Check if we have available accounts
  const accounts = accountStore.list({ provider: providerId });
  const nonBannedAccounts = accounts.filter(a => !banDetector.isBanned(a.id));

  if (accounts.length > 0 && nonBannedAccounts.length === 0) {
    return { allowed: false, reason: "All accounts banned", retryAfter: 3600 };
  }

  return { allowed: true };
}

/**
 * Get security stats for monitoring
 */
export function getSecurityStats() {
  return {
    rateLimits: rateLimiter.windows,
    accountUsage: requestDistributor.accountUsage,
    banStatus: banDetector.failures,
  };
}
