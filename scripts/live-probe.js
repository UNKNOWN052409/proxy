import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.TEST_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.TEST_API_KEY || "");
if (!baseUrl || !apiKey) throw new Error("TEST_BASE_URL and TEST_API_KEY are required");
const started = performance.now();
let response;
try {
  response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error.name || "request_failed", message: String(error.message || "").slice(0, 160), latencyMs: Math.round(performance.now() - started) }));
  process.exitCode = 2;
}
if (!response) process.exit();
const latencyMs = Math.round(performance.now() - started);
const text = await response.text();
let data = null;
try { data = JSON.parse(text); } catch {}
const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
const headers = {};
for (const name of ["server", "via", "cf-ray", "x-request-id", "content-type", "retry-after"]) {
  const value = response.headers.get(name);
  if (value) headers[name] = value.slice(0, 160);
}
console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  statusText: response.statusText,
  latencyMs,
  headers,
  responseShape: data && typeof data === "object" ? Object.keys(data).slice(0, 20) : [],
  modelCount: models.length,
  modelIds: models.slice(0, 20).map((item) => typeof item === "string" ? item : item?.id).filter(Boolean),
  errorType: data?.error?.type || data?.error?.code || null,
}));
if (!response.ok) process.exitCode = 3;
