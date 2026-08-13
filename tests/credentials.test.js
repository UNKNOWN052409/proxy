import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "gateway-credentials-test-"));
process.chdir(dir);
process.env.GATEWAY_CREDENTIAL_MASTER_KEY = "33".repeat(32);
const credentials = await import("../src/lib/gateway/credentials.js");

before(() => {
  assert.equal(credentials.listCredentialMetadata("test-provider").length, 0);
});

after(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.GATEWAY_CREDENTIAL_MASTER_KEY;
});

test("imports encrypted credentials and returns secret-free metadata", () => {
  const added = credentials.importEncryptedCredentials("test-provider", [
    { apiKey: "alpha-secret", refreshToken: "refresh-alpha", label: "primary" },
    { token: "beta-secret", label: "backup" },
  ]);
  assert.equal(added.length, 2);
  assert.equal("apiKey" in added[0], false);
  const metadata = credentials.listCredentialMetadata("test-provider");
  assert.equal(metadata.length, 2);
  assert.equal(metadata[0].label, "primary");
  assert.equal(metadata[0].failureCount, 0);
  assert.equal("encrypted" in metadata[0], false);
});

test("selects, verifies, rotates, and records credential state", () => {
  const first = credentials.selectCredential("test-provider");
  assert.equal(first.apiKey, "alpha-secret");
  assert.equal(first.refreshToken, "refresh-alpha");
  assert.equal(credentials.getCredentialForVerification("test-provider", first.credentialId).apiKey, "alpha-secret");
  assert.equal(credentials.recordCredentialVerification("test-provider", first.credentialId, { status: "verified", authenticityScore: 0.91, ttftMs: 123, model: "model-x", error: "none" }), true);
  assert.equal(credentials.recordCredentialVerification("test-provider", "missing", { status: "x" }), false);
  assert.equal(credentials.listCredentialMetadata("test-provider")[0].verification.status, "verified");
  assert.equal(credentials.updateCredentialTokens("test-provider", first.credentialId, { apiKey: "rotated-secret", refreshToken: "rotated-refresh" }), true);
  assert.equal(credentials.getCredentialForVerification("test-provider", first.credentialId).apiKey, "rotated-secret");
  credentials.markCredentialResult("test-provider", first.credentialId, false, 401);
  assert.equal(credentials.getCredentialPoolStatus("test-provider").ready, 1);
  credentials.markCredentialResult("test-provider", first.credentialId, true, 200);
  assert.equal(credentials.listCredentialMetadata("test-provider").find((item) => item.id === first.credentialId).failureCount, 0);
});

test("filters expired credentials and rejects invalid imports", () => {
  const expired = credentials.importEncryptedCredentials("expired-provider", { apiKey: "expired-secret", expiresAt: "2000-01-01T00:00:00Z" })[0];
  assert.equal(credentials.selectCredential("expired-provider"), null);
  assert.equal(credentials.getCredentialForVerification("expired-provider", expired.id).expired, true);
  assert.equal(credentials.getCredentialPoolStatus("expired-provider").expired, 1);
  assert.throws(() => credentials.importEncryptedCredentials("bad!", { apiKey: "x" }), /valid providerId/);
  assert.throws(() => credentials.importEncryptedCredentials("empty-provider", []), /between 1 and 20/);
  assert.throws(() => credentials.importEncryptedCredentials("newline-provider", { apiKey: "a\nb" }), /bounded API key/);
  assert.throws(() => credentials.importEncryptedCredentials("object-provider", "not-an-object"), /objects/);
});
