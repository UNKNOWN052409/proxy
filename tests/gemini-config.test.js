import assert from "node:assert/strict";
import test from "node:test";
import { getDedicatedProviderProfile } from "../src/lib/gateway/providers/dedicated.js";
import { __testables as configTestables } from "../src/lib/gateway/config.js";

test("Gemini dedicated profile exposes native image capability and documented auth modes", () => {
  const profile = getDedicatedProviderProfile("gemini");
  assert.equal(profile.type, "gemini");
  assert.equal(profile.supportsImageGeneration, true);
  assert.ok(profile.models.includes("gemini-3.1-flash-image"));
  assert.deepEqual(profile.authModes, ["api-key", "oauth2-bearer"]);
});

test("provider normalization preserves Gemini image and OAuth capability flags", () => {
  const normalized = configTestables.normalizeProvider({
    id: "gemini-test",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-3.1-flash-image"],
    supportsImageGeneration: true,
    authMode: "oauth",
  });
  assert.equal(normalized.type, "gemini");
  assert.equal(normalized.supportsImageGeneration, true);
  assert.equal(normalized.authMode, "oauth");
  assert.equal(normalized.models[0], "gemini-3.1-flash-image");
});
