import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";

import { __testables as config } from "../src/lib/gateway/config.js";
import { normalizeNativeToolRequest, normalizeNativeToolCompletion, parseClientManagedToolResponse } from "../src/lib/gateway/tools.js";
import { runReliable, getReliabilityStats, clearReliabilityState, __testables as reliability } from "../src/lib/gateway/reliability.js";
import { validateImageUrl, countImages } from "../src/lib/gateway/vision.js";
import { createChatCompletion, messageText } from "../src/lib/gateway/openai.js";
import { __testables as runtime, getGatewayRuntimeState, importProviderModels, restoreGatewayRuntimeState } from "../src/lib/gateway/runtime-store.js";
import { __testables as health } from "../src/lib/gateway/health.js";
import { __testables as port, listenWithPortFallback } from "../src/lib/runtime/port.js";
import { __testables as credentials } from "../src/lib/gateway/credentials.js";
import { auditProviderEndpoint, detectLeakage, classifyIdentity, __testables as audit } from "../src/lib/gateway/audit.js";
import { detectCustomEndpoint, normalizeCustomEndpointUrl } from "../src/lib/gateway/custom-endpoint.js";
import { executePathModel } from "../src/lib/gateway/providers/openai.js";
import { buildConnection, buildSetup, listProfiles } from "../src/lib/gateway/cli-profiles.js";
import { listDedicatedProviderProfiles } from "../src/lib/gateway/providers/dedicated.js";

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Fetch the weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
}];

test("custom endpoint detection uses documented contracts and redacts sensitive headers", async () => {
  assert.equal(normalizeCustomEndpointUrl("https://api.example.test/v1"), "https://api.example.test/v1");
  assert.throws(() => normalizeCustomEndpointUrl("https://user:pass@example.test/v1"), /credentials/);
  const responses = new Map([
    ["https://api.example.test/v1/openapi.json", { status: 200, headers: new Headers({ "content-type": "application/json", "set-cookie": "secret" }), json: { info: { title: "OpenAI API" }, paths: { "/chat/completions": { post: {} } } } }],
    ["https://api.example.test/v1/swagger.json", { status: 404, headers: new Headers({ "content-type": "application/json" }), json: {} }],
    ["https://api.example.test/v1/v1/openapi.json", { status: 404, headers: new Headers({ "content-type": "application/json" }), json: {} }],
    ["https://api.example.test/v1/v1/models", { status: 200, headers: new Headers({ "content-type": "application/json", "x-provider": "fixture" }), json: { data: [{ id: "model-a" }] } }],
    ["https://api.example.test/v1/models", { status: 401, headers: new Headers({ "content-type": "application/json" }), json: { error: "unauthorized" } }],
  ]);
  const result = await detectCustomEndpoint({ baseUrl: "https://api.example.test/v1", apiKey: "secret", fetchImpl: async (url, options) => {
    if (String(url).endsWith("/v1/models") && responses.get(String(url))?.status === 401) assert.equal(options.headers.authorization, "Bearer secret");
    const item = responses.get(String(url));
    return { status: item?.status || 404, headers: item?.headers || new Headers(), text: async () => JSON.stringify(item?.json || {}) };
  } });
  assert.equal(result.detectedType, "openai");
  assert.deepEqual(result.models, ["model-a"]);
  assert.ok(result.evidence.includes("documented_spec:/openapi.json"));
  assert.ok(result.evidence.includes("model_catalog:/v1/models"));
  assert.equal(result.checks.some((check) => check.headers?.authorization), false);
});

test("path-style custom endpoint extracts a candidate model without probing or claiming identity", async () => {
  const result = await detectCustomEndpoint({ baseUrl: "https://prexzyapis.com/ai/qwen3-5-397b-a17b" });
  assert.equal(result.detectedType, "path-model");
  assert.equal(result.adapter, "custom-path");
  assert.deepEqual(result.models, ["qwen3-5-397b-a17b"]);
  assert.equal(result.traffic, "none");
  assert.equal(result.requiresLiveTest, true);
});

test("path-style executor posts to the exact endpoint and normalizes OpenAI-shaped output", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl;
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { total_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await executePathModel({ provider: { id: "prexzy", baseUrl: "https://prexzyapis.com/ai/qwen3-5-397b-a17b", apiKeyHeader: "authorization", headers: {} }, apiKey: "authorized-key", body: { temperature: 0 }, model: "qwen3-5-397b-a17b", messages: [{ role: "user", content: "hi" }], tools: [] });
    assert.equal(calledUrl, "https://prexzyapis.com/ai/qwen3-5-397b-a17b");
    assert.equal(result.completion.choices[0].message.content, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider profiles generate redacted local connection settings and restrict OpenCode to loopback", () => {
  assert.ok(listProfiles().some((profile) => profile.id === "claude"));
  const connection = buildConnection({ profileId: "opencode", baseUrl: "http://127.0.0.1:4096/v1", model: "local/model" });
  assert.equal(connection.authHeader, "Authorization: Bearer $GATEWAY_API_KEY");
  assert.throws(() => buildConnection({ profileId: "opencode", baseUrl: "https://public.example.test/v1" }), /restricted to local/);
});

test("gateway provider config permits HTTPS and loopback HTTP only", () => {
  assert.equal(config.normalizeBaseUrl("https://api.example.test/v1", "example"), "https://api.example.test/v1");
  assert.equal(config.normalizeBaseUrl("http://127.0.0.1:11434/v1", "local"), "http://127.0.0.1:11434/v1");
  assert.throws(() => config.normalizeBaseUrl("http://api.example.test/v1", "example"), /must use HTTPS/);
});
test("provider catalog includes official providers and safe OmniRoute-style free candidates", () => {
  const profiles = listDedicatedProviderProfiles();
  for (const id of ["deepseek", "groq", "perplexity", "mistral", "cohere", "huggingface", "vertex-ai", "azure-openai", "ollama", "lmstudio", "opencode-free", "felo", "pollinations", "qoder", "kilo"]) {
    assert.ok(profiles.some((profile) => profile.id === id), `missing provider profile: ${id}`);
  }
  for (const id of ["opencode-free", "felo", "pollinations", "qoder", "kilo"]) {
    const profile = profiles.find((item) => item.id === id);
    assert.equal(profile.catalogOnly, true);
    assert.equal(profile.allowNoAuth, undefined);
    assert.equal(profile.requiresBaseUrl, true);
  }
  const local = profiles.find((profile) => profile.id === "ollama");
  assert.equal(local.localOnly, true);
  assert.equal(local.allowNoAuth, true);
});

test("provider operations report disabled and blocked credentials as ineligible for routing", () => {
  const base = { id: "operations-fixture", enabled: true, apiKeyEnv: "UNSET_OPERATIONS_FIXTURE_KEY" };
  const emptyPool = { count: 2, ready: 0, disabled: 1, expired: 0, quarantined: 0, authRejected: 1, rateLimited: 0, coolingDown: 0 };
  const blocked = config.providerOperations(base, { configured: true, credentialPool: emptyPool, quarantined: false });
  assert.equal(blocked.routingStatus, "credential_blocked");
  assert.equal(blocked.routingEligible, false);
  assert.equal(blocked.accounts.authRejected, 1);
  const disabled = config.providerOperations({ ...base, enabled: false }, { configured: true, credentialPool: { ...emptyPool, ready: 1 }, quarantined: false });
  assert.equal(disabled.routingStatus, "disabled");
  assert.equal(disabled.routingEligible, false);
  const quarantined = config.providerOperations(base, { configured: true, credentialPool: { ...emptyPool, ready: 1 }, quarantined: true });
  assert.equal(quarantined.routingStatus, "quarantined");
  assert.equal(quarantined.routingEligible, false);
  const ready = config.providerOperations(base, { configured: true, credentialPool: { ...emptyPool, ready: 1 }, quarantined: false });
  assert.equal(ready.routingStatus, "eligible");
  assert.equal(ready.routingEligible, true);
});

test("gateway configuration tracks a valid expiry timestamp", () => {
  assert.equal(config.normalizeExpiry("2030-01-01T00:00:00Z", "test"), "2030-01-01T00:00:00.000Z");
  assert.throws(() => config.normalizeExpiry("not-a-date", "test"), /invalid expiresAt/);
});

test("merge-only provider imports reject embedded secrets and sensitive headers", () => {
  assert.throws(() => runtime.sanitizeProvider({ id: "safe", apiKey: "secret" }), /must not include apiKey/);
  assert.throws(() => runtime.sanitizeProvider({ id: "safe", headers: { Cookie: "session=secret" } }), /not allowed/);
  assert.deepEqual(runtime.sanitizeProvider({ id: "safe", type: "openai", headers: { "X-App": "gateway" } }), { id: "safe", type: "openai", headers: { "X-App": "gateway" } });
});

test("model refresh parser accepts documented model lists and keeps identifiers bounded", () => {
  assert.deepEqual(health.extractModels({ type: "openai" }, { data: [{ id: "model-a" }, { id: "model-b" }, { id: "model-a" }] }), ["model-a", "model-b"]);
  assert.throws(() => health.extractModels({ type: "openai" }, { models: [] }), /invalid model-list response/);
  assert.equal(health.statusFor(401), "authentication_error");
  assert.equal(health.statusFor(429), "rate_limited");
});

test("client-managed tool bridge returns OpenAI tool calls without executing them", () => {
  const completion = parseClientManagedToolResponse({
    model: "local/text-model",
    tools,
    text: '{"tool_calls":[{"name":"get_weather","arguments":{"city":"Delhi"}}],"content":null}',
  });
  const message = completion.choices[0].message;
  assert.equal(completion.choices[0].finish_reason, "tool_calls");
  assert.equal(message.tool_calls[0].function.name, "get_weather");
  assert.deepEqual(JSON.parse(message.tool_calls[0].function.arguments), { city: "Delhi" });
});

test("client-managed tool bridge preserves normal answers", () => {
  const completion = parseClientManagedToolResponse({ model: "local/text-model", tools, text: '{"tool_calls":[],"content":"The weather is pleasant."}' });
  assert.equal(completion.choices[0].finish_reason, "stop");
  assert.equal(completion.choices[0].message.content, "The weather is pleasant.");
});

test("vision fallback accepts bounded inline images and rejects remote image fetching", () => {
  const image = validateImageUrl("data:image/png;base64,aGVsbG8=");
  assert.equal(image.mediaType, "image/png");
  assert.equal(image.bytes, 5);
  assert.throws(() => validateImageUrl("https://example.test/image.png"), /remote image URLs are disabled/);
  assert.equal(countImages([{ role: "user", content: [{ type: "text", text: "Hi" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }] }]), 1);
});

test("OpenAI completion helpers preserve text content", () => {
  const completion = createChatCompletion({ model: "provider/model", content: "ok" });
  assert.equal(completion.object, "chat.completion");
  assert.equal(completion.choices[0].message.content, "ok");
  assert.equal(messageText([{ type: "text", text: "one" }, { type: "text", text: "two" }]), "one\ntwo");
});

test("endpoint audit detects prompt-leak indicators without retaining response text", () => {
  const clean = detectLeakage("GATEWAY_AUDIT_OK");
  assert.equal(clean.passed, true);
  assert.equal(clean.storedContent, false);
  const leak = detectLeakage("The system prompt says: use this hidden instruction.");
  assert.equal(leak.passed, false);
  assert.ok(leak.findings.includes("system_prompt_reference"));
});

test("endpoint audit reports model mismatch as evidence, not proof", () => {
  const result = classifyIdentity({ advertisedModel: "claude-opus", reportedModel: "deepseek-chat", headers: { "x-upstream-model": "deepseek-chat" } });
  assert.equal(result.verdict, "inconsistent");
  assert.equal(result.confidence, 0.85);
  assert.ok(result.evidence.some((item) => item.type === "response_model_mismatch"));
  assert.match(result.limitation, /cannot prove/i);
});

test("API forensics classifies transport markers and errors without storing bodies", () => {
  const transport = audit.classifyTransport({ url: "https://api.example.test/v1/models", status: 200, headers: { server: "cloudflare", "cf-ray": "abc", "x-request-id": "req-1", authorization: "secret" } });
  assert.equal(transport.scheme, "https");
  assert.equal(transport.finalHost, "api.example.test");
  assert.ok(transport.intermediaryMarkers.includes("cloudflare"));
  assert.equal(transport.headers.authorization, undefined);
  const error = audit.classifyError({ ok: false, status: 502, text: "Cloudflare upstream error", data: null });
  assert.equal(error.signature.bodyClass, "cdn_error_page");
  assert.equal(error.storedBody, false);
  const report = audit.summarizeForensics({ requestUrl: "https://api.example.test/v1/models", modelResponse: { url: "https://api.example.test/v1/models", status: 200, headers: { server: "cloudflare", "cf-ray": "abc" }, latencyMs: 12, ok: true, data: { data: [] }, text: "" }, probes: [] });
  assert.equal(report.storedBodies, false);
  assert.equal(report.intermediarySuspected, true);
});

test("behavioral audit summarizes observable probes without claiming hidden identity proof", () => {
  const summary = audit.summarizeBehavior({ probes: [
    { id: "sentinel", status: 200, data: { model: "deepseek-chat", choices: [{ message: { content: "GATEWAY_AUDIT_OK" } }] } },
    { id: "self_report", status: 200, data: { choices: [{ message: { content: '{"model_family":"DeepSeek"}' } }] } },
    { id: "tool_capability", status: 200, data: { choices: [{ message: { tool_calls: [{ function: { name: "audit_marker" } }] } }] } },
  ] });
  assert.equal(summary.sentinelMatched, true);
  assert.equal(summary.selfReportObserved, true);
  assert.equal(summary.toolCallObserved, true);
  assert.equal(summary.toolCallName, "audit_marker");
  assert.match(summary.limitation, /cannot prove/i);
});

test("authorized audit integration detects a mismatched reported model and stores no response", async () => {
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("x-upstream-model", "deepseek-chat");
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "deepseek-chat" }] }));
      return;
    }
    response.end(JSON.stringify({ model: "deepseek-chat", choices: [{ message: { content: "GATEWAY_AUDIT_OK" } }] }));
  });
  await new Promise((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, resolve));
  try {
    const provider = { id: "local-audit", type: "openai", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, defaultModel: "claude-opus", headers: {} };
    const result = await auditProviderEndpoint({ provider, apiKey: "authorized-test-key", model: "claude-opus" });
    assert.equal(result.identity.verdict, "inconsistent");
    assert.equal(result.probeTokenMatched, true);
    assert.equal(result.storedResponse, false);
    assert.equal(typeof result.upstreamLatencyMs, "number");
    assert.equal(typeof result.proxyOverheadMs, "number");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("encrypted credential pool round-trips only with the configured 32-byte master key", () => {
  const previous = process.env.GATEWAY_CREDENTIAL_MASTER_KEY;
  process.env.GATEWAY_CREDENTIAL_MASTER_KEY = "11".repeat(32);
  const encrypted = credentials.encrypt("authorized-api-key");
  assert.notEqual(encrypted.ciphertext, "authorized-api-key");
  assert.equal(credentials.decrypt(encrypted), "authorized-api-key");
  if (previous === undefined) delete process.env.GATEWAY_CREDENTIAL_MASTER_KEY;
  else process.env.GATEWAY_CREDENTIAL_MASTER_KEY = previous;
});

test("port utilities fall forward when the preferred localhost port is occupied", async () => {
  assert.equal(port.normalizePort("not-a-port"), 2018);
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen({ port: 0, host: "127.0.0.1" }, resolve));
  const blockedPort = blocker.address().port;
  const server = net.createServer();
  const selected = await listenWithPortFallback(server, { preferredPort: blockedPort, host: "127.0.0.1", attempts: 5 });
  assert.notEqual(selected, blockedPort);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => blocker.close(resolve));
});


test("model catalog import validates IDs and supports merge/replace semantics", () => {
  const before = getGatewayRuntimeState();
  try {
    const merged = importProviderModels("test-model-import", ["model-a", "model-b", "model-a"]);
    assert.equal(merged.imported, 2);
    assert.equal(merged.total, 2);
    assert.equal(merged.source, "manual-import-merge");
    const replaced = importProviderModels("test-model-import", [{ id: "model-c" }], { replace: true });
    assert.equal(replaced.total, 1);
    assert.throws(() => importProviderModels("test-model-import", ["bad model"]), /may not contain paths or whitespace/);
    assert.throws(() => importProviderModels("test-model-import", [{ id: "../secret" }]), /may not contain paths or whitespace/);
  } finally {
    restoreGatewayRuntimeState(before);
  }
});

test("dedicated provider profiles expose safe official and local boundaries", async () => {
  const { DEDICATED_PROVIDER_PROFILES } = await import("../src/lib/gateway/providers/dedicated.js");
  assert.equal(DEDICATED_PROVIDER_PROFILES.qwen.type, "openai");
  assert.equal(DEDICATED_PROVIDER_PROFILES.qwen.adapter, "qwen");
  assert.deepEqual(DEDICATED_PROVIDER_PROFILES.qwen.authModes, ["standard-api-key", "coding-plan-api-key"]);
  assert.equal(DEDICATED_PROVIDER_PROFILES.qwen.oauthStatus, "discontinued-2026-04-15");
  assert.equal(DEDICATED_PROVIDER_PROFILES.manus.oauthOnly, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.manus.oauthPkce, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.manus.oauthAuthUrl, "https://manus.im/openapi/oauth");
  assert.deepEqual(DEDICATED_PROVIDER_PROFILES.manus.oauthScopes, ["create_task"]);
  assert.equal(DEDICATED_PROVIDER_PROFILES.kimi.officialApi, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.grok.baseUrl, "https://api.x.ai/v1");
  assert.equal(DEDICATED_PROVIDER_PROFILES.gitlab.officialApi, "self-managed-only");
  assert.equal(DEDICATED_PROVIDER_PROFILES.opencode.localOnly, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.opencode.allowNoAuth, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.kiro.officialApi, "custom-endpoint-only");
});

test("Qwen adapter only recognizes official ModelStudio hosts and maps thinking options", async () => {
  const { __testables: qwen } = await import("../src/lib/gateway/providers/qwen.js");
  assert.equal(qwen.isOfficialQwenEndpoint("https://coding-intl.dashscope.aliyuncs.com/v1"), true);
  assert.equal(qwen.isOfficialQwenEndpoint("https://example.com/v1"), false);
  const body = qwen.qwenBody({ model: "qwen3-max", enable_thinking: true, thinking_budget: 512 });
  assert.deepEqual(body.extra_body, { enable_thinking: true, thinking_budget: 512 });
});

test("GitLab adapter formats user-owned messages without retaining credentials", async () => {
  const { __testables: gitlab } = await import("../src/lib/gateway/providers/gitlab.js");
  assert.equal(gitlab.endpoint("https://gitlab.example.com/api/v4"), "https://gitlab.example.com/api/v4/chat/completions");
  assert.match(gitlab.textFromMessages([{ role: "user", content: "hello" }]), /user: hello/);
});


test("AWS Bedrock adapter converts OpenAI messages without cookies or remote fetches", async () => {
  const { __testables: bedrock } = await import("../src/lib/gateway/providers/bedrock.js");
  const converted = bedrock.toBedrockMessages([
    { role: "system", content: "Be concise" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ]);
  assert.deepEqual(converted.system, [{ text: "Be concise" }]);
  assert.deepEqual(converted.messages, [{ role: "user", content: [{ text: "hello" }] }, { role: "assistant", content: [{ text: "hi" }] }]);
  assert.match(bedrock.canonicalQuery(new URLSearchParams("b=2&a=1")), /^a=1&b=2$/);
  assert.equal(bedrock.usageFrom({ usage: { inputTokens: 3, outputTokens: 4 } }).total_tokens, 7);
});

test("OAuth state records expire and are not reusable after pruning", async () => {
  const { __testables: oauth } = await import("../src/lib/gateway/oauth.js");
  const states = { old: { providerId: "demo", createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }, fresh: { providerId: "demo", createdAt: new Date().toISOString() } };
  const pruned = oauth.pruneStates(states);
  assert.equal(pruned.old, undefined);
  assert.equal(pruned.fresh.providerId, "demo");
});


test("Manus Open App authorization uses PKCE and does not expose secrets", async () => {
  const { createOAuthAuthorization } = await import("../src/lib/gateway/oauth.js");
  const result = createOAuthAuthorization({
    provider: {
      id: "manus",
      oauthAuthUrl: "https://manus.im/openapi/oauth",
      oauthTokenUrl: "https://api.manus.ai/oauth/token",
      oauthScopes: ["create_task"],
      oauthPkce: true,
    },
    clientId: "manus-test-client",
    redirectUri: "http://127.0.0.1:2018/api/gateway/oauth/manus/callback",
  });
  const url = new URL(result.authorizationUrl);
  assert.equal(result.pkce, true);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.get("scope"), "create_task");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("MiMo profile uses official API-key modes and api-key header without importing CLI OAuth state", async () => {
  const { DEDICATED_PROVIDER_PROFILES } = await import("../src/lib/gateway/providers/dedicated.js");
  assert.equal(DEDICATED_PROVIDER_PROFILES.mimo.baseUrl, "https://api.xiaomimimo.com/v1");
  assert.equal(DEDICATED_PROVIDER_PROFILES.mimo.apiKeyHeader, "api-key");
  assert.deepEqual(DEDICATED_PROVIDER_PROFILES.mimo.authModes, ["standard-api-key", "token-plan-api-key"]);
  assert.equal(DEDICATED_PROVIDER_PROFILES.mimo.oauthStatus, "official-login-creates-api-key");

  const server = http.createServer((request, response) => {
    assert.equal(request.headers["api-key"], "mimo-test-key");
    assert.equal(request.headers.authorization, undefined);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      id: "mimo-test",
      object: "chat.completion",
      model: "mimo-v2.5-pro",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
  });
  await new Promise((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, resolve));
  try {
    const { executeOpenAi } = await import("../src/lib/gateway/providers/openai.js");
    const result = await executeOpenAi({
      provider: { id: "mimo", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeyHeader: "api-key", headers: {} },
      apiKey: "mimo-test-key",
      body: { stream: false },
      model: "mimo-v2.5-pro",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
    });
    assert.equal(result.completion.choices[0].message.content, "ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("authenticity scoring flags failed canaries and implausibly fast premium-model TTFT", () => {
  const result = audit.scoreAuthenticity({
    advertisedModel: "claude-opus",
    identity: { verdict: "consistent" },
    leakage: { findings: [] },
    result: {
      probes: [
        { id: "sentinel", expected: "GATEWAY_AUDIT_OK", ttftMs: 120, data: { choices: [{ message: { content: "wrong" } }] } },
        { id: "count_r", expected: "3", data: { choices: [{ message: { content: "2" } }] } },
      ],
    },
  });
  assert.equal(result.status, "quarantined");
  assert.equal(result.failedCanaries, 2);
  assert.equal(result.ttftMs, 120);
});

test("authenticity scoring keeps bounded context probes as evidence, not proof", () => {
  const result = audit.scoreAuthenticity({
    advertisedModel: "qwen3.7-plus",
    identity: { verdict: "consistent" },
    leakage: { findings: [] },
    result: {
      probes: [
        { id: "sentinel", expected: "GATEWAY_AUDIT_OK", ttftMs: 900, data: { choices: [{ message: { content: "GATEWAY_AUDIT_OK" } }] } },
        { id: "context_32000", expected: "CONTEXT_OK", contextChars: 32000, data: { choices: [{ message: { content: "CONTEXT_OK" } }] } },
      ],
    },
  });
  assert.equal(result.status, "provisionally_consistent");
  assert.equal(result.failedContexts, 0);
  assert.match(result.limitation, /cannot mathematically prove/i);
});

test("native tool layer preserves schemas, permissions, IDs, results, and parallel-call policy", () => {
  const contract = normalizeNativeToolRequest({
    messages: [{ role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } }] }, { role: "tool", tool_call_id: "call_1", content: "12C" }],
    tools: [{ ...tools[0], function: { ...tools[0].function, permissions: ["network:weather"] } }],
    toolChoice: { type: "function", function: { name: "get_weather" } },
    parallelToolCalls: false,
    permissions: { get_weather: true, unknown: true },
  });
  assert.equal(contract.parallel_tool_calls, false);
  assert.deepEqual(contract.permissions, { get_weather: true });
  const completion = normalizeNativeToolCompletion({
    model: "primary/model",
    tools,
    parallelToolCalls: false,
    completion: { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Delhi" }) } }, { id: "call_2", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Pune" }) } }] } }] },
  });
  assert.equal(completion.choices[0].message.tool_calls.length, 1);
  assert.equal(completion.choices[0].message.tool_calls[0].id, "call_1");
  assert.throws(() => normalizeNativeToolRequest({ messages: [{ role: "tool", tool_call_id: "missing", content: "x" }], tools, toolChoice: "auto" }), /unknown tool_call_id/);
});

test("reliability layer retries timeout once after configured delay and reuses idempotent result", async () => {
  clearReliabilityState();
  let attempts = 0;
  const started = Date.now();
  const first = await runReliable({ timeoutMs: 20, retryDelayMs: 5, maxRetries: 1, idempotencyKey: "test-idempotency", operation: async () => { attempts += 1; if (attempts === 1) await new Promise((resolve) => setTimeout(resolve, 35)); return "ok"; } });
  const elapsed = Date.now() - started;
  const second = await runReliable({ idempotencyKey: "test-idempotency", operation: async () => { attempts += 1; return "wrong"; } });
  assert.equal(first, "ok");
  assert.equal(second, "ok");
  assert.equal(attempts, 2);
  assert.ok(elapsed >= 5);
  assert.ok(getReliabilityStats().maxConcurrency >= 1);
  clearReliabilityState();
});

test("reliability queue returns a clean overload error when the bounded backlog is full", async () => {
  clearReliabilityState();
  const originalMaxQueueSize = reliability.queue.maxQueueSize;
  reliability.queue.maxQueueSize = 0;
  try {
    await assert.rejects(
      () => runReliable({ operation: async () => "not-run" }),
      (error) => error.status === 503 && error.type === "queue_overloaded" && error.code === null,
    );
  } finally {
    reliability.queue.maxQueueSize = originalMaxQueueSize;
    clearReliabilityState();
  }
});

test("reliability queue manages concurrent requests without dropping them", async () => {
  clearReliabilityState();
  const values = await Promise.all(Array.from({ length: 10 }, (_, index) => runReliable({ timeoutMs: 100, maxRetries: 0, operation: async () => index })));
  assert.deepEqual(values.sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index));
  assert.equal(getReliabilityStats().failed, 0);
  clearReliabilityState();
});


test("CLI setup wizard emits provider-specific artifacts without secrets", () => {
  const openCode = buildSetup({ profileId: "opencode", baseUrl: "http://127.0.0.1:4096/v1", model: "local/model" });
  assert.equal(openCode.format, "json");
  assert.match(openCode.content, /opencode.ai\/config\.json/);
  assert.match(openCode.content, /baseURL/);
  assert.equal(openCode.content.includes("authorized-secret"), false);

  const codex = buildSetup({ profileId: "codex", baseUrl: "https://gateway.example.test/v1", model: "openai/gpt" });
  assert.equal(codex.format, "toml");
  assert.match(codex.content, /model_provider = "gateway"/);
  assert.match(codex.content, /base_url/);

  const claude = buildSetup({ profileId: "claude", baseUrl: "https://gateway.example.test/v1", model: "claude-opus-5" });
  assert.match(claude.content, /ANTHROPIC_BASE_URL/);
  assert.match(claude.content, /ANTHROPIC_MODEL=claude-opus-5/);
  assert.match(claude.content, /GATEWAY_API_KEY/);
  assert.equal(claude.content.includes("cookie"), false);

  for (const profileId of ["pi-mono", "prime", "gemini", "qwen", "kimi", "grok", "jcode", "custom"]) {
    const setup = buildSetup({ profileId, baseUrl: "https://gateway.example.test/v1", model: "provider/model-x" });
    assert.match(setup.content, /provider\/model-x/);
    assert.match(setup.content, /OPENAI_BASE_URL=https:\/\/gateway\.example\.test\/v1/);
    assert.equal(setup.content.includes("real-secret"), false);
  }

  const codexModel = buildSetup({ profileId: "codex", baseUrl: "https://gateway.example.test/v1", model: "openai/gpt-5" });
  assert.match(codexModel.content, /model = "openai\/gpt-5"/);
});


test("custom endpoint discovers models without a key, retries only after auth failure, and verifies once", async () => {
  const calls = [];
  const result = await detectCustomEndpoint({
    baseUrl: "https://live.example.test/v1",
    apiKey: "secret",
    verifyOne: true,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.authorization || null, method: options.method || "GET" });
      if (String(url).endsWith("/v1/models")) {
        if (!options.headers.authorization) return { status: 401, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ error: "auth required" }) };
        return { status: 200, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ data: [{ id: "live-model" }] }) };
      }
      if (String(url).endsWith("/v1/chat/completions")) {
        return { status: 200, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ id: "cmpl-live", model: "live-model", choices: [{ message: { role: "assistant", content: "gateway-test-ok" } }] }) };
      }
      return { status: 404, headers: new Headers(), text: async () => "{}" };
    },
  });
  assert.deepEqual(result.models, ["live-model"]);
  assert.equal(result.oneRequest.ok, true);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(calls.filter((call) => call.method === "GET").length, 7);
  assert.equal(calls.some((call) => call.authorization === "Bearer secret"), true);
});
