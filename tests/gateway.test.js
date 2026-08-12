import test from "node:test";
import assert from "node:assert/strict";

import { __testables as config } from "../src/lib/gateway/config.js";
import { parseClientManagedToolResponse } from "../src/lib/gateway/tools.js";
import { validateImageUrl, countImages } from "../src/lib/gateway/vision.js";
import { createChatCompletion, messageText } from "../src/lib/gateway/openai.js";

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
