/**
 * Rate-limited request queue manager
 * Processes requests slowly when rate limits are hit to avoid blocking
 */

import RequestQueue from "../queue/request-queue.js";
import { log } from "../logger.js";

// Per-provider queues (each provider gets its own queue)
const providerQueues = new Map();

// Rate limit configurations per provider (requests per minute)
const RATE_LIMITS = {
  kiro: 60,
  opencode: 999999, // Unlimited
  anthropic: 60,
  openai: 60,
  cursor: 60,
  gemini: 15, // Gemini has 15 RPM limit
  github: 60,
  openrouter: 60,
  antigravity: 60,
  grok: 60,
  groq: 30, // Groq has stricter rate limits
  deepseek: 60,
  qwen: 60,
  perplexity: 60,
  cohere: 60,
  mistral: 60,
  huggingface: 30, // Free tier is rate limited
  ollama: 999999, // Local, unlimited
  lmstudio: 999999, // Local, unlimited
  "github-copilot": 60,
  "azure-openai": 60,
  "vertex-ai": 60,
  unknown: 30,
};

/**
 * Get or create queue for a provider
 */
function getQueue(providerId) {
  if (!providerQueues.has(providerId)) {
    const queue = new RequestQueue({
      maxConcurrency: 10, // Process up to 10 requests concurrently per provider
    });
    providerQueues.set(providerId, queue);
  }
  return providerQueues.get(providerId);
}

/**
 * Detect user tier from request (premium vs free)
 * Premium users get high priority in queue
 */
function detectUserTier(req) {
  // Check for premium indicators
  const premiumHeader = req.headers["x-premium-user"];
  const authHeader = req.headers["authorization"];
  const accountId = req.headers["x-selected-account"];

  // Premium indicators:
  // 1. X-Premium-User header set to "true"
  // 2. Authorization header with "premium" in it
  // 3. Account ID with "premium" or "pro" prefix
  if (premiumHeader === "true") {
    return "premium";
  }

  if (authHeader && authHeader.toLowerCase().includes("premium")) {
    return "premium";
  }

  if (accountId && (accountId.includes("premium") || accountId.includes("pro"))) {
    return "premium";
  }

  // Default to free tier
  return "free";
}

/**
 * Calculate delay between requests to respect rate limit
 * For 60 RPM limit: 1000ms between requests (60 requests per 60 seconds)
 */
function calculateDelay(providerId, requestsInLastMinute) {
  const rateLimit = RATE_LIMITS[providerId] || 60;

  // If we're under the rate limit, no delay needed
  if (requestsInLastMinute < rateLimit) {
    return 0;
  }

  // Calculate delay to stay under rate limit
  // For 60 RPM: 60000ms / 60 = 1000ms between requests
  const delayMs = Math.ceil(60000 / rateLimit);

  return delayMs;
}

/**
 * Enqueue a rate-limited request
 * Returns a promise that resolves when the request is processed
 */
async function enqueueRequest(providerId, handler, req, res, bodyBuffer, mappedModel, requestsInLastMinute) {
  const queue = getQueue(providerId);
  const userTier = detectUserTier(req);

  // Premium users get high priority, free users get normal priority
  const priority = userTier === "premium" ? "high" : "normal";

  // Calculate how long to wait before processing this request
  const delay = calculateDelay(providerId, requestsInLastMinute);

  log(`[Queue] Enqueueing ${providerId} request (tier: ${userTier}, priority: ${priority}, delay: ${delay}ms, queue: ${queue.getStats().queuedByPriority[priority]})`);

  // Enqueue the request with appropriate priority
  return queue.enqueue(async () => {
    // Wait for the calculated delay to respect rate limits
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Execute the handler
    log(`[Queue] Processing ${providerId} request (tier: ${userTier})`);
    await handler(req, res, bodyBuffer, mappedModel);
  }, priority);
}

/**
 * Get queue statistics for a provider
 */
function getQueueStats(providerId) {
  const queue = providerQueues.get(providerId);
  if (!queue) {
    return {
      queued: 0,
      active: 0,
      queuedByPriority: { high: 0, normal: 0, low: 0 },
    };
  }
  return queue.getStats();
}

/**
 * Get all queue statistics (for monitoring)
 */
function getAllQueueStats() {
  const stats = {};
  for (const [providerId, queue] of providerQueues.entries()) {
    stats[providerId] = queue.getStats();
  }
  return stats;
}

export {
  enqueueRequest,
  detectUserTier,
  getQueueStats,
  getAllQueueStats,
  RATE_LIMITS,
};
