const MODEL_PATHS = ["/v1/models", "/models"];
const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/v1/openapi.json"];
const PROMPT_MARKERS = ["PROMPT_HERE", "{prompt}", "{{prompt}}"];
const BLOCKED_HEADER_NAMES = new Set([
  "authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization", "content-length", "host", "connection",
  "x-forwarded-for", "x-real-ip", "forwarded", "cf-connecting-ip", "true-client-ip", "client-ip", "x-client-ip",
]);

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hasPromptTemplate(url) {
  return PROMPT_MARKERS.some((marker) => url.includes(marker));
}

export function normalizeCustomEndpointUrl(value, { allowInsecureHttp = false } = {}) {
  if (typeof value !== "string" || !value.trim()) throw new Error("baseUrl is required");
  const url = new URL(value.trim());
  const template = hasPromptTemplate(value.trim());
  if (url.username || url.password || url.hash) throw new Error("Custom endpoint URL must not contain credentials or fragments");
  if (url.search && !template) throw new Error("Query parameters require a prompt template such as PROMPT_HERE");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (isLoopback(url.hostname) || allowInsecureHttp))) {
    throw new Error("Custom endpoint must use HTTPS; HTTP is allowed only for loopback or explicit one-request testing");
  }
  return url.toString().replace(/PROMPT_HERE|\{\{prompt\}\}|\{prompt\}/g, "PROMPT_HERE");
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

function redactText(value, max = 240) {
  return String(value || "").replace(/(authorization|cookie|token|api[-_]?key|password)\s*[:=]\s*[^\s,;]+/gi, "$1:[REDACTED]").slice(0, max);
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

function templateUrl(template, prompt) {
  const url = new URL(template.replace(/PROMPT_HERE/g, encodeURIComponent(prompt)));
  return url.toString();
}

export async function testPromptTemplate({ endpointUrl, prompt = "Reply with exactly: gateway-test-ok", apiKey, method = "GET", fetchImpl = fetch, timeoutMs = 8000, allowInsecureHttp = false } = {}) {
  const normalized = normalizeCustomEndpointUrl(endpointUrl, { allowInsecureHttp });
  if (!hasPromptTemplate(normalized)) throw new Error("Endpoint must include PROMPT_HERE, {prompt}, or {{prompt}}");
  const target = templateUrl(normalized, prompt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(timeoutMs) || 8000, 500), 10000));
  const started = Date.now();
  try {
    const headers = { accept: "application/json, text/plain, */*" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(target, { method: String(method).toUpperCase() === "POST" ? "POST" : "GET", headers, signal: controller.signal, redirect: "manual" });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* plain text endpoints are supported */ }
    const responseText = typeof json === "string" ? json : json?.response || json?.output || json?.text || json?.message || text;
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      contentType: response.headers.get("content-type") || null,
      responsePreview: redactText(responseText),
      responseShape: json && typeof json === "object" ? Object.keys(json).slice(0, 20) : ["text"],
      headers: safeHeaders(Object.fromEntries(response.headers.entries())),
      traffic: "one-explicit-request",
    };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: error.name === "AbortError" ? "timeout" : redactText(error.message), traffic: "one-explicit-request" };
  } finally {
    clearTimeout(timer);
  }
}

export async function detectCustomEndpoint({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 5000, allowInsecureHttp = false, liveTest = false, testPrompt, testMethod } = {}) {
  const normalizedBaseUrl = normalizeCustomEndpointUrl(baseUrl, { allowInsecureHttp });
  const evidence = [];
  const checks = [];
  let detectedType = null;
  let models = [];
  const template = hasPromptTemplate(normalizedBaseUrl);
  if (template && !liveTest) {
    return {
      baseUrl: normalizedBaseUrl,
      detectedType: "prompt-template",
      adapter: "custom",
      models: [], checks: [], evidence: ["prompt_template:recognized", "traffic:none"],
      autoConfigured: false, requiresLiveTest: true,
      limitations: ["No request was sent", "A live test requires an explicit user action", "Unknown contracts require explicit request/response mapping"]
    };
  }
  if (template && liveTest) {
    const test = await testPromptTemplate({ endpointUrl: normalizedBaseUrl, prompt: testPrompt, method: testMethod, apiKey, fetchImpl, timeoutMs, allowInsecureHttp });
    return {
      baseUrl: normalizedBaseUrl, detectedType: "prompt-template", adapter: "custom", models: [], checks: [{ mode: "prompt-template", status: test.status, latencyMs: test.latencyMs }], evidence: ["prompt_template:recognized", `live_test:${test.ok ? "success" : "failed"}`], autoConfigured: false, requiresLiveTest: false, liveTest: test,
      limitations: ["One explicit request only", "Response shape does not prove backend model identity", "Unknown contracts require explicit request/response mapping"]
    };
  }
  for (const path of SPEC_PATHS) {
    try {
      const result = await requestJson(joinUrl(normalizedBaseUrl, path), { apiKey, fetchImpl, timeoutMs });
      checks.push({ path, status: result.status, contentType: result.contentType });
      const inferred = inferFromSpec(result.json);
      if (inferred) detectedType = inferred;
      if (result.status >= 200 && result.status < 300 && result.json) evidence.push(`documented_spec:${path}`);
      if (result.status >= 300 && result.status !== 404) break;
    } catch (error) { checks.push({ path, error: error.name === "AbortError" ? "timeout" : "request_failed" }); }
  }
  for (const path of MODEL_PATHS) {
    try {
      const result = await requestJson(joinUrl(normalizedBaseUrl, path), { apiKey, fetchImpl, timeoutMs });
      checks.push({ path, status: result.status, contentType: result.contentType });
      const ids = modelIds(result.json);
      if (ids.length) models = [...new Set([...models, ...ids])];
      if (result.status >= 200 && result.status < 300 && ids.length) { evidence.push(`model_catalog:${path}`); detectedType ||= "openai"; }
      if (result.status === 401 || result.status === 403) evidence.push(`auth_boundary:${path}:${result.status}`);
    } catch (error) { checks.push({ path, error: error.name === "AbortError" ? "timeout" : "request_failed" }); }
  }
  return { baseUrl: normalizedBaseUrl, detectedType: detectedType || "unknown", adapter: detectedType === "anthropic" ? "anthropic" : detectedType === "openai" ? "openai" : "custom", models, checks, evidence, autoConfigured: detectedType === "openai" || detectedType === "anthropic", requiresLiveTest: false, traffic: "metadata-probes", limitations: ["Detection uses documented HTTP contracts only", "No browser traffic, cookies, sessions, or private endpoints are inspected", "Unknown contracts require explicit request/response mapping"] };
}

export const __testables = { inferFromSpec, modelIds, safeHeaders, hasPromptTemplate, templateUrl };
