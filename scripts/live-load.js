import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.TEST_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.TEST_API_KEY || "");
const model = String(process.env.TEST_MODEL || "");
const count = Number(process.env.TEST_COUNT || 10);
const ratePerMinute = Number(process.env.TEST_RATE_PER_MINUTE || count);
const maxInFlight = Math.max(1, Number(process.env.TEST_CONCURRENCY || 10));
if (!baseUrl || !apiKey || !model || !Number.isInteger(count) || count < 1 || count > 500 || !Number.isFinite(ratePerMinute) || ratePerMinute < 1) {
  throw new Error("TEST_BASE_URL, TEST_API_KEY, TEST_MODEL, valid TEST_COUNT (1-500), and TEST_RATE_PER_MINUTE are required");
}

const intervalMs = 60_000 / ratePerMinute;
const results = [];
let nextIndex = 0;
const startedAt = performance.now();

async function one(index) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 4, temperature: 0, stream: false }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const diagnosticHeaders = {};
    for (const name of ["retry-after", "x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens", "server", "via"]) {
      const value = response.headers.get(name);
      if (value) diagnosticHeaders[name] = value.slice(0, 160);
    }
    results[index] = {
      status: response.status,
      ok: response.ok,
      latencyMs: Math.round(performance.now() - started),
      hasChoices: Array.isArray(data?.choices),
      hasUsage: Boolean(data?.usage),
      errorType: data?.error?.type || data?.error?.code || null,
      errorMessage: typeof data?.error?.message === "string" ? data.error.message.slice(0, 160) : null,
      diagnosticHeaders,
    };
  } catch (error) {
    results[index] = { status: 0, ok: false, latencyMs: Math.round(performance.now() - started), errorType: error.name || "request_failed" };
  }
}

async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= count) return;
    await one(index);
  }
}

let launchIndex = 0;
let inFlight = 0;
const waiters = [];
const waitForSlot = async () => {
  if (inFlight < maxInFlight) return;
  await new Promise((resolve) => waiters.push(resolve));
};
const releaseSlot = () => {
  inFlight -= 1;
  const resolve = waiters.shift();
  if (resolve) resolve();
};
const scheduleStart = performance.now();
const scheduled = [];
while (launchIndex < count) {
  const index = launchIndex++;
  await waitForSlot();
  const dueMs = Math.max(0, Math.round(index * intervalMs - (performance.now() - scheduleStart)));
  inFlight += 1;
  scheduled.push(new Promise((resolve) => setTimeout(async () => {
    try { await one(index); } finally { releaseSlot(); resolve(); }
  }, dueMs)));
}
await Promise.all(scheduled);

const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
const statuses = {};
for (const item of results) statuses[item.status] = (statuses[item.status] || 0) + 1;
const percentile = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] : null;
const elapsedSec = (performance.now() - startedAt) / 1000;
console.log(JSON.stringify({
  baseHost: new URL(baseUrl).host,
  model,
  requested: count,
  completed: results.length,
  elapsedSec: Number(elapsedSec.toFixed(2)),
  effectiveRps: Number((results.length / elapsedSec).toFixed(3)),
  statuses,
  successCount: results.filter((item) => item.ok).length,
  errorCount: results.filter((item) => !item.ok).length,
  contractSuccessCount: results.filter((item) => item.ok && item.hasChoices).length,
  p50Ms: percentile(0.50),
  p95Ms: percentile(0.95),
  p99Ms: percentile(0.99),
  maxMs: latencies.at(-1) || null,
  errorTypes: [...new Set(results.map((item) => item.errorType).filter(Boolean))].slice(0, 20),
  errorMessages: [...new Set(results.map((item) => item.errorMessage).filter(Boolean))].slice(0, 5),
  diagnosticHeaders: Object.fromEntries([...new Map(results.flatMap((item) => Object.entries(item.diagnosticHeaders || []))).entries()]),
}));
