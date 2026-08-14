import assert from "node:assert/strict";
import test from "node:test";
import { executeGeminiImage } from "../src/lib/gateway/providers/gemini.js";

function response(status, body) {
  return new Response(body == null ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function provider(overrides = {}) {
  return {
    id: "gemini-test",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/",
    authMode: "api-key",
    headers: { "X-Trace": "allowed", Cookie: "blocked", Host: "blocked" },
    ...overrides,
  };
}

test("Gemini image adapter uses the documented interactions payload and strips unsafe configured headers", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, payload: JSON.parse(options.body) };
    return response(200, { output_image: { data: " base64-image " } });
  };
  try {
    const result = await executeGeminiImage({
      provider: provider(),
      apiKey: "authorized-key",
      model: "gemini-3.1-flash-image",
      body: { prompt: "A small green square", aspect_ratio: "1:1" },
    });
    assert.equal(captured.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(captured.options.headers["x-goog-api-key"], "authorized-key");
    assert.equal(captured.options.headers["X-Trace"], "allowed");
    assert.equal(captured.options.headers.Cookie, undefined);
    assert.equal(captured.payload.model, "gemini-3.1-flash-image");
    assert.deepEqual(captured.payload.input, [{ type: "text", text: "A small green square" }]);
    assert.equal(captured.payload.generation_config.aspect_ratio, "1:1");
    assert.deepEqual(result.data, [{ b64_json: "base64-image" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini image adapter uses OAuth bearer credentials and maps provider errors without exposing headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer oauth-token");
    assert.equal(options.headers["x-goog-api-key"], undefined);
    return response(429, { error: { message: "quota reached", status: "RESOURCE_EXHAUSTED" } });
  };
  try {
    await assert.rejects(
      () => executeGeminiImage({ provider: provider({ authMode: "oauth" }), apiKey: "oauth-token", model: "image", body: { prompt: "x" } }),
      (error) => error.status === 400 && error.type === "upstream_error" && error.code === "RESOURCE_EXHAUSTED" && error.message === "quota reached",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini image adapter rejects invalid prompts and malformed successful responses", async () => {
  await assert.rejects(
    () => executeGeminiImage({ provider: provider(), apiKey: "key", model: "image", body: { prompt: "   " } }),
    (error) => error.status === 400 && error.type === "invalid_request_error",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(200, { output_image: {} });
  try {
    await assert.rejects(
      () => executeGeminiImage({ provider: provider(), apiKey: "key", model: "image", body: { prompt: "valid" } }),
      (error) => error.status === 502 && error.type === "upstream_error" && error.message === "Gemini returned no generated image",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
