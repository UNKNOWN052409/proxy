import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKeyPolicy, assertKeyPolicy } from "../src/lib/api-keys/policy.js";
import { usageStore } from "../src/lib/usage/store.js";

const key = { id: 900001, owner_user_id: 44, rpm_limit: 2, token_limit: 100 };

test.beforeEach(() => {
  usageStore.clear({ apiKeyId: key.id });
});

test.after(() => {
  usageStore.clear({ apiKeyId: key.id });
});

test("allows a key below RPM and token budgets", () => {
  const result = evaluateKeyPolicy(key, { model: "gpt-test", provider: "test" });
  assert.equal(result.allowed, true);
  assert.equal(result.rpmLimit, 2);
  assert.equal(result.tokenLimit, 100);
});

test("blocks a key at the rolling RPM limit", () => {
  usageStore.record({ apiKeyId: key.id, ownerUserId: key.owner_user_id, provider: "test", model: "test/model", tokens: 1, duration: 1 });
  usageStore.record({ apiKeyId: key.id, ownerUserId: key.owner_user_id, provider: "test", model: "test/model", tokens: 1, duration: 1 });
  const result = evaluateKeyPolicy(key);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "rate_limit_exceeded");
  assert.throws(() => assertKeyPolicy(key), (error) => error.status === 429 && error.code === "rate_limit_exceeded");
});

test("blocks a key at the rolling daily token limit", () => {
  usageStore.record({ apiKeyId: key.id, ownerUserId: key.owner_user_id, provider: "test", model: "test/model", tokens: 100, duration: 1 });
  const result = evaluateKeyPolicy({ ...key, rpm_limit: 0 });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "token_limit_exceeded");
});

test("does not apply zero limits", () => {
  usageStore.record({ apiKeyId: key.id, ownerUserId: key.owner_user_id, provider: "test", model: "test/model", tokens: 100000, duration: 1 });
  const result = evaluateKeyPolicy({ ...key, rpm_limit: 0, token_limit: 0 });
  assert.equal(result.allowed, true);
});
