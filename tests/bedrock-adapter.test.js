import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { executeBedrock, listBedrockModels, __testables } from "../src/lib/gateway/providers/bedrock.js";

const AWS_ENV_KEYS = ["AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"];

async function withAwsEnvironment(callback) {
  const before = Object.fromEntries(AWS_ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
    AWS_SECRET_ACCESS_KEY: "secret-example",
    AWS_SESSION_TOKEN: "session-example",
  });
  delete process.env.AWS_DEFAULT_REGION;
  try {
    return await callback();
  } finally {
    for (const key of AWS_ENV_KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test("Bedrock signer canonicalizes credentials and includes bounded session authentication", () => {
  const headers = __testables.signRequest({
    method: "POST",
    url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/demo/converse?z=last&a=first",
    body: '{"hello":"world"}',
    region: "us-east-1",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret-example",
    sessionToken: "session-example",
  });
  assert.equal(headers.host, "bedrock-runtime.us-east-1.amazonaws.com");
  assert.equal(headers["x-amz-security-token"], "session-example");
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/bedrock\/aws4_request,/);
  assert.match(headers.Authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token/);
});

test("Bedrock adapter sends an official Converse request and normalizes the assistant result", async () => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ url: request.url, headers: request.headers, body: JSON.parse(raw) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: { message: { content: [{ text: "Hello" }, { text: " from Bedrock" }] } },
      stopReason: "end_turn",
      usage: { inputTokens: 3, outputTokens: 4 },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await withAwsEnvironment(async () => {
      const result = await executeBedrock({
        provider: { id: "bedrock", baseUrl: `http://127.0.0.1:${port}` },
        body: { temperature: 0.2, top_p: 0.9, max_completion_tokens: 128, stop: "END" },
        model: "anthropic.claude-test-v1",
        messages: [
          { role: "system", content: "Be concise" },
          { role: "user", content: [{ type: "text", text: "Hello" }, { type: "image_url", image_url: { url: "data:image/png;base64,aW1n" } }] },
        ],
      });
      assert.equal(result.completion.model, "bedrock/anthropic.claude-test-v1");
      assert.equal(result.completion.choices[0].message.content, "Hello from Bedrock");
      assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 });
    });
    assert.equal(requests[0].url, "/model/anthropic.claude-test-v1/converse");
    assert.match(requests[0].headers.authorization, /^AWS4-HMAC-SHA256 /);
    assert.equal(requests[0].headers["x-amz-security-token"], "session-example");
    assert.deepEqual(requests[0].body, {
      system: [{ text: "Be concise" }],
      messages: [{ role: "user", content: [{ text: "Hello" }, { image: { format: "png", source: { bytes: { type: "Buffer", data: [105, 109, 103] } } } }] }],
      inferenceConfig: { temperature: 0.2, topP: 0.9, maxTokens: 128, stopSequences: ["END"] },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Bedrock adapter rejects missing credentials and maps upstream failure and empty output safely", async () => {
  const before = Object.fromEntries(AWS_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of AWS_ENV_KEYS) delete process.env[key];
  try {
    await assert.rejects(() => executeBedrock({ provider: { id: "bedrock" }, body: {}, model: "demo", messages: [] }), /requires AWS region/);
  } finally {
    for (const key of AWS_ENV_KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }

  const originalFetch = global.fetch;
  try {
    await withAwsEnvironment(async () => {
      global.fetch = async () => new Response(JSON.stringify({ message: "denied" }), { status: 403, headers: { "content-type": "application/json" } });
      await assert.rejects(
        () => executeBedrock({ provider: { id: "bedrock" }, body: {}, model: "demo", messages: [{ role: "user", content: "hi" }] }),
        (error) => error.status === 400 && error.type === "upstream_error" && error.code === null && /denied/.test(error.message),
      );
      global.fetch = async () => new Response(JSON.stringify({ output: { message: { content: [] } } }), { status: 200, headers: { "content-type": "application/json" } });
      await assert.rejects(
        () => executeBedrock({ provider: { id: "bedrock" }, body: {}, model: "demo", messages: [{ role: "user", content: "hi" }] }),
        /no assistant message/,
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("Bedrock model discovery signs the documented control-plane request and returns bounded unique IDs", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  try {
    await withAwsEnvironment(async () => {
      global.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(JSON.stringify({ modelSummaries: [{ modelId: "a" }, { modelId: "a" }, { modelId: "b" }, { modelId: "" }] }), { status: 200, headers: { "content-type": "application/json" } });
      };
      assert.deepEqual(await listBedrockModels({ provider: { id: "bedrock" } }), ["a", "b"]);
    });
    assert.equal(calls[0].url, "https://bedrock.us-east-1.amazonaws.com/foundation-models");
    assert.match(calls[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);
  } finally {
    global.fetch = originalFetch;
  }
});
