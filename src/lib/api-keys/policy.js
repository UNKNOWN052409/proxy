import { usageStore } from "../usage/store.js";

export function evaluateKeyPolicy(keyRecord, { model = null, provider = null } = {}) {
  if (!keyRecord) return { allowed: false, code: "invalid_api_key", reason: "API key is missing or invalid" };
  const window = usageStore.getWindowUsage({ apiKeyId: keyRecord.id, windowMs: 60000 });
  const daily = usageStore.getWindowUsage({ apiKeyId: keyRecord.id, windowMs: 86400000 });
  const rpmLimit = Number(keyRecord.rpm_limit || 0);
  const tokenLimit = Number(keyRecord.token_limit || 0);
  if (rpmLimit > 0 && window.requests >= rpmLimit) {
    return { allowed: false, code: "rate_limit_exceeded", reason: `RPM limit of ${rpmLimit} exceeded`, retryAfterSeconds: 60 };
  }
  if (tokenLimit > 0 && daily.tokens >= tokenLimit) {
    return { allowed: false, code: "token_limit_exceeded", reason: `24-hour token limit of ${tokenLimit} exceeded`, retryAfterSeconds: 86400 };
  }
  return { allowed: true, model, provider, window, daily, rpmLimit, tokenLimit };
}

export function assertKeyPolicy(keyRecord, request) {
  const result = evaluateKeyPolicy(keyRecord, request);
  if (!result.allowed) {
    const error = new Error(result.reason);
    error.status = 429;
    error.code = result.code;
    error.type = "rate_limit_error";
    error.retryAfterSeconds = result.retryAfterSeconds;
    throw error;
  }
  return result;
}
