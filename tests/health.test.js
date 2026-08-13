import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "gateway-health-test-"));
process.env.GATEWAY_SQLITE_PATH = join(dir, "health.db");
process.env.GATEWAY_CREDENTIAL_MASTER_KEY = "22".repeat(32);
process.env.GATEWAY_TEST_API_KEY = "test-key";

const { createServer } = await import("node:http");
const { refreshGatewayProvider, refreshGatewayModels, __testables } = await import("../src/lib/gateway/health.js");

let server;
let baseUrl;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/v1/models") {
      if (req.headers.authorization !== "Bearer test-key") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "invalid key" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "local-model" }, { id: "local-model" }, { id: "second-model" }] }));
      return;
    }
    if (req.url === "/invalid/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ invalid: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
  for (const key of ["GATEWAY_SQLITE_PATH", "GATEWAY_CREDENTIAL_MASTER_KEY", "GATEWAY_TEST_API_KEY", "GATEWAY_PROVIDERS_JSON"]) delete process.env[key];
});

function configure(provider) {
  process.env.GATEWAY_PROVIDERS_JSON = JSON.stringify([provider]);
}

test("health testables normalize endpoints, headers, and statuses", () => {
  assert.equal(__testables.modelEndpoint({ type: "openai", baseUrl: "https://api.example/v1" }), "https://api.example/v1/models");
  assert.equal(__testables.modelEndpoint({ type: "anthropic", baseUrl: "https://api.example/v1" }), "https://api.example/v1/models?limit=1000");
  assert.equal(__testables.modelEndpoint({ type: "gitlab", baseUrl: "https://gitlab.example/api/v4" }), "https://gitlab.example/api/v4/version");
  assert.deepEqual(__testables.providerHeaders({ type: "anthropic", headers: { Cookie: "blocked", "x-extra": "yes" } }, "key"), { "x-api-key": "key", "anthropic-version": "2023-06-01", "x-extra": "yes" });
  assert.equal(__testables.statusFor(401), "authentication_error");
  assert.equal(__testables.statusFor(429), "rate_limited");
  assert.equal(__testables.statusFor(503), "unavailable");
  assert.equal(__testables.statusFor(400), "error");
  assert.deepEqual(__testables.extractModels({}, { data: [{ id: "a" }, { id: "a" }, { id: "" }] }), ["a"]);
  assert.throws(() => __testables.extractModels({}, {}), /invalid model-list/);
});

test("refreshes a configured local provider and deduplicates model IDs", async () => {
  configure({ id: "local", type: "custom", baseUrl, insecureHttp: true, apiKeyEnv: "GATEWAY_TEST_API_KEY", models: [] });
  const result = await refreshGatewayProvider("local");
  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["local-model", "second-model"]);
  assert.equal(result.health.status, "healthy");
  const all = await refreshGatewayModels(["local"]);
  assert.equal(all.ok, true);
  assert.equal(all.totalModels, 2);
});

test("classifies authentication and invalid-payload failures", async () => {
  configure({ id: "bad", type: "custom", baseUrl: `${baseUrl}/invalid`, insecureHttp: true, apiKeyEnv: "GATEWAY_TEST_API_KEY" });
  const invalid = await refreshGatewayProvider("bad");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.health.status, "error");
  configure({ id: "missing", type: "custom", baseUrl, insecureHttp: true, apiKeyEnv: "GATEWAY_MISSING_KEY" });
  const missing = await refreshGatewayProvider("missing");
  assert.equal(missing.ok, false);
  assert.equal(missing.health.status, "missing_configuration");
  await assert.rejects(() => refreshGatewayProvider("unknown"), /Unknown provider/);
});
