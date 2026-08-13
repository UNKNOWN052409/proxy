import test from "node:test";
import assert from "node:assert/strict";
import {
  gatewayError,
  openAiErrorResponse,
  corsHeaders,
  getBearerToken,
  validateChatRequest,
  messageText,
  hasImages,
  createChatCompletion,
  createSingleSseResponse,
} from "../src/lib/gateway/openai.js";

test("validates OpenAI-compatible request shapes and bearer tokens", () => {
  assert.equal(getBearerToken(new Request("http://localhost", { headers: { authorization: "Bearer abc" } })), "abc");
  assert.equal(getBearerToken(new Request("http://localhost", { headers: { authorization: "basic abc" } })), null);
  assert.deepEqual(validateChatRequest({ messages: [{ role: "user", content: "hi" }] }).messages.length, 1);
  assert.throws(() => validateChatRequest(null), /JSON object/);
  assert.throws(() => validateChatRequest({}), /non-empty array/);
  assert.throws(() => validateChatRequest({ messages: [], tools: "bad" }), /non-empty array/);
  assert.throws(() => validateChatRequest({ messages: [{ role: "user" }], tools: {} }), /tools must be an array/);
  assert.throws(() => validateChatRequest({ messages: [{ role: "user" }], stream: "true" }), /stream must be a boolean/);
});

test("normalizes message content and detects images", () => {
  assert.equal(messageText("plain"), "plain");
  assert.equal(messageText([{ type: "text", text: "one" }, { type: "image_url", image_url: { url: "x" } }, { type: "text", text: "two" }]), "one\ntwo");
  assert.equal(messageText({ type: "text" }), "");
  assert.equal(hasImages([{ content: "plain" }]), false);
  assert.equal(hasImages([{ content: [{ type: "image_url", image_url: { url: "x" } }] }]), true);
});

test("creates completion and SSE responses with tool calls and usage", async () => {
  const completion = createChatCompletion({ model: "model-x", content: null, toolCalls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{}" } }], finishReason: "tool_calls", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
  assert.equal(completion.object, "chat.completion");
  assert.equal(completion.choices[0].message.tool_calls[0].id, "call-1");
  const response = createSingleSseResponse(completion);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const body = await response.text();
  assert.match(body, /chat.completion.chunk/);
  assert.match(body, /call-1/);
  assert.match(body, /\[DONE\]/);
});

test("formats CORS and OpenAI error responses", async () => {
  process.env.GATEWAY_CORS_ORIGIN = "https://example.test";
  assert.equal(corsHeaders()["Access-Control-Allow-Origin"], "https://example.test");
  const error = gatewayError("bad request", 422, "invalid_request_error", "bad_input");
  const response = openAiErrorResponse(error);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: { message: "bad request", type: "invalid_request_error", code: "bad_input" } });
  delete process.env.GATEWAY_CORS_ORIGIN;
});
