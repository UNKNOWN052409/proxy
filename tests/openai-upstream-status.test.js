import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { __testables } from "../src/lib/gateway/providers/openai.js";

async function withServer(statusCode, body, run) {
  const server = http.createServer((_request, response) => {
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const statusCode of [401, 404, 429]) {
  test(`OpenAI-compatible adapter preserves upstream HTTP ${statusCode}`, async () => {
    await withServer(statusCode, { error: { message: "controlled upstream error", code: "controlled" } }, async (url) => {
      await assert.rejects(
        () => __testables.postJson(url, { method: "POST", headers: {}, body: "{}" }, 1_000),
        (error) => error?.status === statusCode && error?.type === "upstream_error" && error?.code === "controlled",
      );
    });
  });
}

test("OpenAI-compatible adapter maps upstream server errors to 502", async () => {
  await withServer(503, { error: { message: "controlled overload" } }, async (url) => {
    await assert.rejects(
      () => __testables.postJson(url, { method: "POST", headers: {}, body: "{}" }, 1_000),
      (error) => error?.status === 502 && error?.type === "upstream_error",
    );
  });
});
