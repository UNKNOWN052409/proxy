import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { executeOpenAiImage } from "../src/lib/gateway/providers/openai.js";
import { executeGeminiImage } from "../src/lib/gateway/providers/gemini.js";
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

test("image generation forwards bounded fields and normalizes the OpenAI response", async () => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(raw) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ created: 123, data: [{ url: "https://cdn.example.test/image.png", revised_prompt: "safe prompt" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const result = await executeOpenAiImage({
      provider: { id: "openai", baseUrl: `http://127.0.0.1:${port}/v1`, apiKeyHeader: "authorization", headers: {} },
      apiKey: "test-key",
      model: "gpt-image-1",
      body: { prompt: "a red kite", size: "1024x1024", quality: "high", ignored: "drop" },
    });
    assert.deepEqual(result, { created: 123, data: [{ url: "https://cdn.example.test/image.png", revised_prompt: "safe prompt" }] });
    assert.equal(requests[0].url, "/v1/images/generations");
    assert.equal(requests[0].authorization, "Bearer test-key");
    assert.deepEqual(requests[0].body, { model: "gpt-image-1", prompt: "a red kite", size: "1024x1024", quality: "high" });
    await assert.rejects(() => executeOpenAiImage({ provider: { id: "openai", baseUrl: `http://127.0.0.1:${port}/v1` }, body: { prompt: "" }, model: "gpt-image-1" }), /Image prompt is required/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("native Gemini image adapter uses official interactions payload and auth modes", async () => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ url: request.url, apiKey: request.headers["x-goog-api-key"], authorization: request.headers.authorization, body: JSON.parse(raw) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ output_image: { data: "aW1hZ2UtYnl0ZXM=" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const result = await executeGeminiImage({
      provider: { id: "gemini", baseUrl: `http://127.0.0.1:${port}/v1beta`, authMode: "api-key", headers: {} },
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-image",
      body: { prompt: "a red kite", ignored: "drop" },
    });
    assert.deepEqual(result, { created: result.created, data: [{ b64_json: "aW1hZ2UtYnl0ZXM=" }] });
    assert.equal(requests[0].url, "/v1beta/interactions");
    assert.equal(requests[0].apiKey, "gemini-key");
    assert.equal(requests[0].authorization, undefined);
    assert.deepEqual(requests[0].body, { model: "gemini-3.1-flash-image", input: [{ type: "text", text: "a red kite" }] });

    await executeGeminiImage({
      provider: { id: "gemini", baseUrl: `http://127.0.0.1:${port}/v1beta`, authMode: "oauth", headers: {} },
      apiKey: "oauth-token",
      model: "gemini-3-pro-image",
      body: { prompt: "a blue kite" },
    });
    assert.equal(requests[1].authorization, "Bearer oauth-token");
    await assert.rejects(() => executeGeminiImage({ provider: { id: "gemini", baseUrl: `http://127.0.0.1:${port}/v1beta` }, model: "gemini-3.1-flash-image", body: { prompt: "" } }), /Image prompt is required/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
