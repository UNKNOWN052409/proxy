import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

import { __testables as config } from "../src/lib/gateway/config.js";
import { parseClientManagedToolResponse } from "../src/lib/gateway/tools.js";
import { validateImageUrl, countImages } from "../src/lib/gateway/vision.js";
import { createChatCompletion, messageText } from "../src/lib/gateway/openai.js";
import { __testables as runtime } from "../src/lib/gateway/runtime-store.js";
import { __testables as health } from "../src/lib/gateway/health.js";
import { __testables as port, listenWithPortFallback } from "../src/lib/runtime/port.js";
import { __testables as credentials } from "../src/lib/gateway/credentials.js";

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
