const BLOCKED_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"]);
const MODEL_PATHS = ["/v1/models", "/models"];
const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/v1/openapi.json"];

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function normalizeCustomEndpointUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("baseUrl is required");
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error("Custom endpoint URL must not contain credentials, query parameters, or fragments");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new Error("Custom endpoint must use HTTPS; HTTP is allowed only for loopback development endpoints");
  }
  return url.toString().replace(/\/$/, "");
}

function safeHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = String(key).toLowerCase();
    if (BLOCKED_HEADER_NAMES.has(normalized)) continue;
    if (typeof value === "string" && value.length <= 256) result[normalized] = value;
  }
  return result;
}

function joinUrl(base, path) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function requestJson(url, { apiKey, fetchImpl, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(timeoutMs) || 5000, 500), 8000));
  try {
    const headers = { accept: "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal, redirect: "manual" });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON is evidence, not a crash */ }
    return { status: response.status, headers: safeHeaders(Object.fromEntries(response.headers.entries())), json, contentType: response.headers.get("content-type") || null };
  } finally {
    clearTimeout(timer);
  }
}

function inferFromSpec(spec) {
  if (!spec || typeof spec !== "object") return null;
  const paths = Object.keys(spec.paths || {});
  const joined = paths.join(" ").toLowerCase();
  if (joined.includes("chat/completions") || joined.includes("responses")) return "openai";
  if (joined.includes("messages") && (spec.info?.title || "").toLowerCase().includes("anthropic")) return "anthropic";
  return paths.length ? "custom" : null;
}

function modelIds(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.data)) return json.data.map((item) => typeof item === "string" ? item : item?.id).filter((id) => typeof id === "string").slice(0, 100);
  if (Array.isArray(json.models)) return json.models.map((item) => typeof item === "string" ? item : item?.id || item?.name).filter((id) => typeof id === "string").slice(0, 100);
  return [];
}

export async function detectCustomEndpoint({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const normalizedBaseUrl = normalizeCustomEndpointUrl(baseUrl);
  const evidence = [];
  const checks = [];
  let detectedType = null;
  let models = [];
  for (const path of SPEC_PATHS) {
    try {
      const result = await requestJson(joinUrl(normalizedBaseUrl, path), { apiKey, fetchImpl, timeoutMs });
      checks.push({ path, status: result.status, contentType: result.contentType });
      const inferred = inferFromSpec(result.json);
      if (inferred) detectedType = inferred;
      if (result.status >= 200 && result.status < 300 && result.json) evidence.push(`documented_spec:${path}`);
      if (result.status >= 300 && result.status !== 404) break;
    } catch (error) {
      checks.push({ path, error: error.name === "AbortError" ? "timeout" : "request_failed" });
    }
  }
  for (const path of MODEL_PATHS) {
    try {
      const result = await requestJson(joinUrl(normalizedBaseUrl, path), { apiKey, fetchImpl, timeoutMs });
      checks.push({ path, status: result.status, contentType: result.contentType });
      const ids = modelIds(result.json);
      if (ids.length) models = [...new Set([...models, ...ids])];
      if (result.status >= 200 && result.status < 300 && ids.length) {
        evidence.push(`model_catalog:${path}`);
        detectedType ||= "openai";
      }
      if (result.status === 401 || result.status === 403) evidence.push(`auth_boundary:${path}:${result.status}`);
    } catch (error) {
      checks.push({ path, error: error.name === "AbortError" ? "timeout" : "request_failed" });
    }
  }
  return {
    baseUrl: normalizedBaseUrl,
    detectedType: detectedType || "unknown",
    adapter: detectedType === "anthropic" ? "anthropic" : detectedType === "openai" ? "openai" : "custom",
    models,
    checks,
    evidence,
    autoConfigured: detectedType === "openai" || detectedType === "anthropic",
    limitations: ["Detection uses documented HTTP contracts only", "No browser traffic, cookies, sessions, or private endpoints are inspected", "Unknown contracts require explicit request/response mapping"]
  };
}

export const __testables = { inferFromSpec, modelIds, safeHeaders };
