import { refreshGatewayModels } from "./health.js";

const MIN_INTERVAL_MS = 60_000;
let timer = null;
let running = false;
let lastRun = null;
let lastResult = null;

function intervalFrom(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 24 * 60 * 60 * 1000;
  return Math.max(MIN_INTERVAL_MS, Math.min(parsed, 7 * 24 * 60 * 60 * 1000));
}

export function getRefreshSchedulerStatus() {
  return {
    enabled: Boolean(timer),
    running,
    intervalMs: timer?.intervalMs || null,
    lastRun,
    lastResult,
  };
}

export async function runScheduledRefresh(providerIds = null) {
  if (running) return { ok: false, skipped: true, reason: "refresh_already_running" };
  running = true;
  lastRun = new Date().toISOString();
  try {
    lastResult = await refreshGatewayModels(providerIds);
    return lastResult;
  } finally {
    running = false;
  }
}

export function startRefreshScheduler({ intervalMs = process.env.GATEWAY_MODEL_REFRESH_INTERVAL_MS, providerIds = null, runImmediately = false } = {}) {
  stopRefreshScheduler();
  const interval = intervalFrom(intervalMs);
  const callback = () => { void runScheduledRefresh(providerIds).catch(() => undefined); };
  timer = setInterval(callback, interval);
  timer.unref?.();
  timer.intervalMs = interval;
  if (runImmediately) callback();
  return getRefreshSchedulerStatus();
}

export function stopRefreshScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  return getRefreshSchedulerStatus();
}

export const __testables = { intervalFrom };
