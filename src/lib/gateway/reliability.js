import RequestQueue from "../queue/request-queue.js";
import { gatewayError } from "./openai.js";

function boundedPositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

// The retry wait remains five seconds. The first-attempt deadline is longer because
// legitimate authorized models can take longer than five seconds to return a small reply.
const DEFAULT_TIMEOUT_MS = boundedPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, 15_000, { min: 1_000, max: 120_000 });
const DEFAULT_RETRY_DELAY_MS = boundedPositiveInteger(process.env.GATEWAY_RETRY_DELAY_MS, 5_000, { min: 0, max: 60_000 });
const DEFAULT_MAX_RETRIES = boundedPositiveInteger(process.env.GATEWAY_MAX_RETRIES, 1, { min: 0, max: 3 });
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 2_000;

const configuredConcurrency = Number(process.env.GATEWAY_MAX_CONCURRENCY || 12);
const configuredBacklog = Number(process.env.GATEWAY_MAX_QUEUE_SIZE || 96);
const queue = new RequestQueue({
  maxConcurrency: Number.isFinite(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : 12,
  maxQueueSize: Number.isFinite(configuredBacklog) && configuredBacklog >= 0 ? configuredBacklog : 96,
});
const idempotency = new Map();

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function redact(value) {
  return String(value || "").replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]").slice(0, 240);
}

function isRetryable(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return error?.code === "upstream_timeout" || error?.name === "AbortError" || status === 408 || status === 425 || status === 429 || status >= 500 || /timeout|timed out|temporarily unavailable|reset by peer/i.test(String(error?.message || ""));
}

function timeoutError() { return gatewayError("Upstream provider timed out", 504, "upstream_timeout"); }

async function executeWithTimeout(operation, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError()), timeoutMs); });
  try { return await Promise.race([Promise.resolve().then(operation), timeout]); }
  finally { clearTimeout(timer); }
}

function pruneIdempotency() {
  const now = Date.now();
  for (const [key, entry] of idempotency) if (entry.expiresAt <= now) idempotency.delete(key);
  while (idempotency.size > MAX_IDEMPOTENCY_ENTRIES) idempotency.delete(idempotency.keys().next().value);
}

export async function runReliable({ operation, idempotencyKey = null, priority = "normal", timeoutMs = DEFAULT_TIMEOUT_MS, retryDelayMs = DEFAULT_RETRY_DELAY_MS, maxRetries = DEFAULT_MAX_RETRIES, requestId = "unknown", onRetry } = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  pruneIdempotency();
  const key = idempotencyKey ? String(idempotencyKey).slice(0, 200) : null;
  if (key && idempotency.has(key)) return idempotency.get(key).value;

  const queueStats = queue.getStats();
  if (queueStats.maxQueueSize !== null && queueStats.queued >= queueStats.maxQueueSize) {
    throw gatewayError("Gateway queue is at capacity; retry shortly", 503, "queue_overloaded");
  }

  const promise = queue.enqueue(async () => {
    let attempt = 0;
    while (true) {
      try {
        const value = await executeWithTimeout(operation, timeoutMs);
        if (key) idempotency.set(key, { value, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
        return value;
      } catch (error) {
        if (attempt >= maxRetries || !isRetryable(error)) throw error;
        attempt += 1;
        console.warn(JSON.stringify({ event: "gateway_retry", requestId: redact(requestId), attempt, delayMs: retryDelayMs, error: redact(error?.message) }));
        onRetry?.({ attempt, delayMs: retryDelayMs, error });
        await sleep(retryDelayMs);
      }
    }
  }, priority);

  if (key) idempotency.set(key, { value: promise, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  return promise;
}

export function getReliabilityStats() {
  return {
    ...queue.getStats(),
    idempotencyEntries: idempotency.size,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  };
}
export function clearReliabilityState() { idempotency.clear(); queue.clear(gatewayError("Reliability queue cleared", 503, "queue_cleared")); }
export const __testables = { isRetryable, executeWithTimeout, pruneIdempotency, boundedPositiveInteger, queue, idempotency };
