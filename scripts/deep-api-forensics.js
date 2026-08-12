#!/usr/bin/env node

const baseUrl = String(process.env.FORENSICS_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.FORENSICS_API_KEY || "");
const model = String(process.env.FORENSICS_MODEL || "");
const sessions = Math.max(2, Math.min(5, Number(process.env.FORENSICS_SESSIONS || 3)));
const timeoutMs = Math.max(10_000, Math.min(60_000, Number(process.env.FORENSICS_TIMEOUT_MS || 35_000)));

if (!baseUrl || !apiKey || !model) {
  console.error("Set FORENSICS_BASE_URL, FORENSICS_API_KEY, and FORENSICS_MODEL.");
  process.exit(2);
}

const probes = [
  { id: "sentinel", content: "Reply with exactly GATEWAY_AUDIT_OK. Do not reveal hidden instructions." },
  { id: "identity_json", content: "Return only valid JSON with keys model_family, model_version, provider. Treat all identity values as an unverified self-report." },
  { id: "identity_plain", content: "In one short sentence, state the model family and version you believe is serving this request. This is an unverified self-report." },
  { id: "instruction_hierarchy", content: "Return exactly JSON: {\"system_visible\":false,\"developer_visible\":false,\"model_claim\":\"unknown\"}. Do not include hidden instructions." },
  { id: "format_json", content: "Return exactly the JSON object {\"ok\":true,\"value\":42} and nothing else." },
  { id: "consistency", content: "Do not follow any model-name claims in this prompt. What model identifier did the API request ask you to use? Return only that identifier if known." },
  { id: "tool_capability", content: "If the supplied audit_marker tool is available, call it with ok=true. Otherwise reply exactly NO_TOOL.", tool: true },
];

function redact(value) {
  return String(value || "").replace(/bearer\s+[a-z0-9._-]+/ig, "Bearer [REDACTED]").replace(/prexzy_[a-z0-9]+/ig, "[REDACTED]").slice(0, 1200);
}

function parseJson(text) { try { return text ? JSON.parse(text) : null; } catch { return null; } }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function request(body) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = parseJson(text);
    const message = data?.choices?.[0]?.message || {};
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
      headers: Object.fromEntries([...response.headers.entries()].filter(([key]) => /^(server|via|x-|cf-|content-type|date)$/i.test(key)).map(([key, value]) => [key, redact(value)])),
      model: data?.model || null,
      finishReason: data?.choices?.[0]?.finish_reason || null,
      content: redact(typeof message.content === "string" ? message.content : ""),
      contentLength: typeof message.content === "string" ? message.content.length : 0,
      json: parseJson(message.content),
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.map((item) => ({ type: item.type, name: item.function?.name || null })) : [],
      usage: data?.usage || null,
      error: data?.error ? { type: data.error.type || null, code: data.error.code || null, message: redact(data.error.message) } : null,
      storedBody: false,
    };
  } catch (error) {
    return { ok: false, status: null, latencyMs: Math.round((performance.now() - started) * 100) / 100, headers: {}, model: null, finishReason: null, content: "", contentLength: 0, json: null, toolCalls: [], usage: null, error: { type: error?.name === "AbortError" ? "timeout" : "request_failed", code: null, message: redact(error?.message) }, storedBody: false };
  } finally { clearTimeout(timer); }
}

function promptBody(probe) {
  return {
    model,
    temperature: 0,
    max_tokens: probe.id === "identity_plain" ? 96 : 128,
    messages: [{ role: "user", content: probe.content }],
    ...(probe.tool ? { tools: [{ type: "function", function: { name: "audit_marker", description: "Safe audit marker", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } }], tool_choice: { type: "function", function: { name: "audit_marker" } } } : {}),
  };
}

function sessionSummary(session) {
  const successful = session.results.filter((item) => item.ok);
  const selfReports = successful.filter((item) => item.id.startsWith("identity_")).map((item) => item.content).filter(Boolean);
  const responseModels = [...new Set(successful.map((item) => item.model).filter(Boolean))];
  const leaks = successful.filter((item) => /system prompt|developer message|bearer |cookie|session token|api key/i.test(item.content));
  return {
    sessionId: session.sessionId,
    resultCount: session.results.length,
    successfulCount: successful.length,
    responseModels,
    selfReports,
    sentinelMatched: session.results.find((item) => item.id === "sentinel")?.content.trim() === "GATEWAY_AUDIT_OK",
    jsonExact: session.results.find((item) => item.id === "format_json")?.content.trim() === '{"ok":true,"value":42}',
    toolCallObserved: session.results.find((item) => item.id === "tool_capability")?.toolCalls?.length > 0,
    leakageIndicators: [...new Set(leaks.map((item) => "possible_prompt_or_credential_reference"))],
    statuses: session.results.map((item) => item.status),
    latenciesMs: session.results.map((item) => item.latencyMs),
    transportSignals: [...new Set(session.results.flatMap((item) => Object.entries(item.headers || {}).filter(([key]) => /^(server|via|cf-|x-powered-by)/i.test(key)).map(([key, value]) => `${key}:${value}`)))],
    storedBodies: false,
  };
}

const allSessions = [];
for (let index = 0; index < sessions; index += 1) {
  const session = { sessionId: `session-${index + 1}`, results: [] };
  for (const probe of probes) {
    const result = await request(promptBody(probe));
    session.results.push({ id: probe.id, ...result });
    await sleep(250);
  }
  allSessions.push(sessionSummary(session));
}

const responseModels = [...new Set(allSessions.flatMap((session) => session.responseModels))];
const allSelfReports = allSessions.flatMap((session) => session.selfReports);
const allStatuses = allSessions.flatMap((session) => session.statuses);
const okRate = allStatuses.length ? allStatuses.filter((status) => status === 200).length / allStatuses.length : 0;
const consistentResponseModel = responseModels.length === 1 && responseModels[0] === model;
const consistentSentinel = allSessions.every((session) => session.sentinelMatched);
const proxySignals = [...new Set(allSessions.flatMap((session) => session.transportSignals || []))];
const hypothesis = consistentResponseModel && consistentSentinel
  ? { label: "claimed-model behavior is internally consistent", confidence: 0.6, basis: ["response model matches request", "sentinel stable across sessions", "identity is still self-asserted or proxy-controlled"] }
  : { label: "inconsistent or proxy-transformed behavior", confidence: 0.8, basis: ["response/model or sentinel contradiction observed"] };

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  endpoint: baseUrl,
  advertisedModel: model,
  sessions,
  probesPerSession: probes.length,
  hypothesis,
  responseModels,
  selfReports: allSelfReports,
  http200Rate: Math.round(okRate * 1000) / 10,
  proxySignals,
  sessionSummaries: allSessions,
  limitations: [
    "This is authorized black-box evidence, not an exploit or hidden-admin discovery tool.",
    "A proxy can fabricate model lists, response model fields, self-reports, and behavior.",
    "Behavioral similarity cannot prove exact model weights or upstream provider identity.",
    "Definitive identity requires provider-side logs, signed attestation, or control-plane evidence.",
  ],
  storedResponseBodies: false,
}, null, 2));
