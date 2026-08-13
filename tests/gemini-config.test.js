import assert from "node:assert/strict";
import test from "node:test";
import { getDedicatedProviderProfile } from "../src/lib/gateway/providers/dedicated.js";
import { __testables as configTestables } from "../src/lib/gateway/config.js";

test("Gemini dedicated profile exposes native image capability and documented auth modes", () => {
  const profile = getDedicatedProviderProfile("gemini");
  assert.equal(profile.type, "gemini");
  assert.equal(profile.supportsImageGeneration, true);
  assert.ok(profile.models.includes("gemini-3.1-flash-image"));
  assert.deepEqual(profile.authModes, ["api-key", "oauth2-authorization-code", "oauth2-device-code", "service-account"]);
  assert.equal(profile.oauthDeviceCodeUrl, "https://oauth2.googleapis.com/device/code");
});

test("provider normalization preserves Gemini image and OAuth capability flags", () => {
  const normalized = configTestables.normalizeProvider({
    id: "gemini-test",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-3.1-flash-image"],
    supportsImageGeneration: true,
    oauthDeviceCodeUrl: "https://oauth2.googleapis.com/device/code",
    authMode: "oauth",
  });
  assert.equal(normalized.type, "gemini");
  assert.equal(normalized.supportsImageGeneration, true);
  assert.equal(normalized.authMode, "oauth");
  assert.equal(normalized.models[0], "gemini-3.1-flash-image");
  assert.equal(normalized.oauthDeviceCodeUrl, "https://oauth2.googleapis.com/device/code");
});

test("Hugging Face profile exposes official OAuth inference metadata", () => {
  const profile = getDedicatedProviderProfile("huggingface");
  assert.equal(profile.baseUrl, "https://router.huggingface.co/v1");
  assert.ok(profile.authModes.includes("oauth2-authorization-code"));
  assert.ok(profile.authModes.includes("oauth2-device-code"));
  assert.equal(profile.oauthAuthUrl, "https://huggingface.co/oauth/authorize");
  assert.equal(profile.oauthDeviceCodeUrl, "https://huggingface.co/oauth/device");
  assert.equal(profile.oauthTokenUrl, "https://huggingface.co/oauth/token");
  assert.deepEqual(profile.oauthScopes, ["inference-api", "read-endpoints"]);
});

test("Azure OpenAI profile exposes official Azure AD OAuth inference metadata", () => {
  const profile = getDedicatedProviderProfile("azure-openai");
  assert.ok(profile.authModes.includes("oauth2-authorization-code-pkce"));
  assert.ok(profile.authModes.includes("oauth2-device-code"));
  assert.ok(profile.authModes.includes("service-principal"));
  assert.ok(profile.authModes.includes("managed-identity"));
  assert.equal(profile.oauthAuthUrl, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
  assert.equal(profile.oauthDeviceCodeUrl, "https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode");
  assert.equal(profile.oauthTokenUrl, "https://login.microsoftonline.com/organizations/oauth2/v2.0/token");
  assert.deepEqual(profile.oauthScopes, ["https://cognitiveservices.azure.com/.default", "offline_access"]);
});

test("provider normalization preserves Azure OAuth profile metadata", () => {
  const normalized = configTestables.normalizeProvider({
    ...getDedicatedProviderProfile("azure-openai"),
    id: "azure-openai-test",
    baseUrl: "https://example.openai.azure.com/openai/deployments/prod",
    authMode: "oauth2-bearer",
  });
  assert.equal(normalized.authMode, "oauth2-bearer");
  assert.equal(normalized.oauthPkce, true);
  assert.equal(normalized.oauthClientIdEnv, "AZURE_OPENAI_OAUTH_CLIENT_ID");
  assert.equal(normalized.oauthDeviceCodeUrl, "https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode");
});
