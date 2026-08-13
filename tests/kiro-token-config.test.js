import assert from "node:assert/strict";
import test, { after } from "node:test";

process.env.KIRO_AUTH_TOKEN = "test-token-only";
process.env.GATEWAY_KIRO_BASE_URL = "http://127.0.0.1:4096/v1";
process.env.GATEWAY_KIRO_MODELS = "kiro-model-a,kiro-model-b";
process.env.GATEWAY_KIRO_DEFAULT_MODEL = "kiro-model-a";

const { getGatewayProviders, getGatewayStatus } = await import("../src/lib/gateway/config.js");

test("Kiro official auth token becomes an encrypted-pool-compatible bearer provider", () => {
  const provider = getGatewayProviders().find((item) => item.id === "kiro");
  assert.ok(provider);
  assert.equal(provider.apiKeyEnv, "KIRO_AUTH_TOKEN");
  assert.equal(provider.authMode, "bearer-token");
  assert.equal(provider.apiKeyHeader, "authorization");
  assert.deepEqual(provider.models, ["kiro-model-a", "kiro-model-b"]);
  assert.equal(provider.defaultModel, "kiro-model-a");
  assert.equal(provider.baseUrl, "http://127.0.0.1:4096/v1");
  assert.match(provider.availabilityNote, /browser sign-in is not a gateway OAuth flow/i);
  assert.match(provider.availabilityNote, /paid-plan, provider-authorized compatible endpoint/i);
});

test("Kiro status never exposes the token value", () => {
  const status = getGatewayStatus();
  const kiro = status.providers.find((item) => item.id === "kiro");
  assert.ok(kiro);
  assert.equal(Object.values(kiro).includes("test-token-only"), false);
  assert.equal(kiro.apiKeyEnv, undefined);
  const directoryEntry = status.supportedProviders.find((item) => item.id === "kiro");
  assert.ok(directoryEntry);
  assert.equal(directoryEntry.availabilityNote, kiro.availabilityNote);
  assert.deepEqual(directoryEntry.authModes, ["bearer-token", "api-key"]);
  assert.equal(directoryEntry.oauthAuthUrl, undefined);
});

test("Kiro API-key fallback preserves bearer transport and reports the API-key mode", () => {
  delete process.env.KIRO_AUTH_TOKEN;
  process.env.KIRO_API_KEY = "test-api-key-only";
  const provider = getGatewayProviders().find((item) => item.id === "kiro");
  assert.ok(provider);
  assert.equal(provider.apiKeyEnv, "KIRO_API_KEY");
  assert.equal(provider.authMode, "api-key");
  assert.equal(provider.apiKeyHeader, "authorization");
  delete process.env.KIRO_API_KEY;
  process.env.KIRO_AUTH_TOKEN = "test-token-only";
});

after(() => {
  delete process.env.KIRO_AUTH_TOKEN;
  delete process.env.GATEWAY_KIRO_BASE_URL;
  delete process.env.GATEWAY_KIRO_MODELS;
  delete process.env.GATEWAY_KIRO_DEFAULT_MODEL;
  delete process.env.KIRO_API_KEY;
});
