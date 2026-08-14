import test from "node:test";
import assert from "node:assert/strict";
import { verifyAuthorizedAccount, __testables } from "../src/lib/gateway/credential-verification.js";

const provider = {
  id: "test-provider",
  defaultModel: "test-model",
  models: ["test-model"],
};

test("authorized account verification rejects disabled accounts before network access", async () => {
  const result = await verifyAuthorizedAccount(provider, {
    id: "disabled-account",
    active: false,
    accessToken: "secret-disabled-token",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.accountId, "disabled-account");
  assert.match(result.error, /disabled/i);
  assert.equal(JSON.stringify(result).includes("secret-disabled-token"), false);
});

test("authorized account verification rejects expired accounts before network access", async () => {
  const result = await verifyAuthorizedAccount(provider, {
    id: "expired-account",
    active: true,
    expiresAt: "2000-01-01T00:00:00.000Z",
    accessToken: "secret-expired-token",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.accountId, "expired-account");
  assert.match(result.error, /expired/i);
  assert.equal(JSON.stringify(result).includes("secret-expired-token"), false);
});

test("verification summary redacts the credential value and keeps safe audit fields", () => {
  const summary = __testables.safeVerificationSummary({
    credentialId: "credential-id",
    model: "requested-model",
    durationMs: 12,
    audit: {
      checkedAt: "2026-01-01T00:00:00.000Z",
      advertisedModel: "reported-model",
      modelListStatus: "ok",
      probeStatus: "ok",
      authenticity: { score: 92, status: "verified", ttftMs: 9, failedCanaries: [] },
      identity: { verdict: "consistent" },
      leakage: { findings: [] },
    },
  });

  assert.equal(summary.status, "verified");
  assert.equal(summary.credentialId, "credential-id");
  assert.equal(summary.model, "reported-model");
  assert.equal(summary.authenticityScore, 92);
  assert.equal(Object.hasOwn(summary, "apiKey"), false);
  assert.equal(Object.hasOwn(summary, "accessToken"), false);
});

test("verification model selection prefers explicit model then provider defaults", () => {
  assert.equal(__testables.modelFor(provider, "requested"), "requested");
  assert.equal(__testables.modelFor(provider), "test-model");
});
