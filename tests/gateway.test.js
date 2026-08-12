import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";

import { __testables as config } from "../src/lib/gateway/config.js";
import { parseClientManagedToolResponse } from "../src/lib/gateway/tools.js";
import { validateImageUrl, countImages } from "../src/lib/gateway/vision.js";
import { createChatCompletion, messageText } from "../src/lib/gateway/openai.js";
import { __testables as runtime, getGatewayRuntimeState, importProviderModels, restoreGatewayRuntimeState } from "../src/lib/gateway/runtime-store.js";
import { __testables as health } from "../src/lib/gateway/health.js";
import { __testables as port, listenWithPortFallback } from "../src/lib/runtime/port.js";
import { __testables as credentials } from "../src/lib/gateway/credentials.js";
import { auditProviderEndpoint, detectLeakage, classifyIdentity, __testables as audit } from "../src/lib/gateway/audit.js";

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Fetch the weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
}];

test("gateway provider config permits HTTPS and loopback HTTP only", () => {
  assert.equal(config.normalizeBaseUrl("https://api.example.test/v1", "example"), "https://api.example.test/v1");
  assert.equal(config.normalizeBaseUrl("http://127.0.0.1:11434/v1", "local"), "http://127.0.0.1:11434/v1");
  assert.throws(() => config.normalizeBaseUrl("http://api.example.test/v1", "example"), /must use HTTPS/);
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
  assert.equal(DEDICATED_PROVIDER_PROFILES.kimi.officialApi, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.grok.baseUrl, "https://api.x.ai/v1");
  assert.equal(DEDICATED_PROVIDER_PROFILES.gitlab.officialApi, "self-managed-only");
  assert.equal(DEDICATED_PROVIDER_PROFILES.opencode.localOnly, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.opencode.allowNoAuth, true);
  assert.equal(DEDICATED_PROVIDER_PROFILES.kiro.officialApi, "custom-endpoint-only");
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
