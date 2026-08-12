import assert from "node:assert/strict";
import { accountStore } from "../src/lib/kiro/store.js";

accountStore._clear();
const first = accountStore.add({ email: "one@example.test", provider: "kiro", accessToken: "oauth-access-1" });
assert.ok(first.id);
assert.equal(accountStore.getById(first.id).email, "one@example.test");

const updated = accountStore.add({ email: "one@example.test", provider: "kiro", refreshToken: "oauth-refresh-1" });
assert.equal(updated.id, first.id);
assert.equal(accountStore.getAll().length, 1);

const imported = accountStore.importFromProxy({ accounts: [
  { email: "two@example.test", accessToken: "oauth-access-2" },
  { email: "unsafe@example.test", accessToken: "x", cookie: "session-cookie" },
  { email: "password@example.test", password: "secret" },
] }, "authorized-token-import");
assert.equal(imported.success, 1);
assert.equal(imported.failed, 0);
assert.equal(accountStore.getAll().length, 2);
assert.equal(accountStore.getAll().some((account) => account.email === "unsafe@example.test"), false);
assert.equal(accountStore.getAll().some((account) => account.email === "password@example.test"), false);

assert.equal(accountStore.remove(first.id), true);
assert.equal(accountStore.getById(first.id), null);
accountStore._clear();
console.log(JSON.stringify({ ok: true, add: true, duplicateUpdate: true, safeImport: true, rejectedUnsafeRecords: true, lookup: true, delete: true }));
