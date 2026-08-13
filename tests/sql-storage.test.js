import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { SqlStore, encryptSecret, decryptSecret } = await import("../src/lib/storage/sql-store.js");

describe("SQLite storage and encrypted credentials", () => {
  let dir;
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gateway-sql-test-"));
    process.env.GATEWAY_CREDENTIAL_MASTER_KEY = "11".repeat(32);
    store = new SqlStore(join(dir, "gateway.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.GATEWAY_CREDENTIAL_MASTER_KEY;
  });

  test("persists JSON values, updates conflict keys, lists namespaces, and deletes", () => {
    assert.equal(store.get("missing", "key", "fallback"), "fallback");
    assert.deepEqual(store.set("config", "port", 2018), 2018);
    assert.deepEqual(store.set("config", "port", 2020), 2020);
    store.setMany("config", { host: "127.0.0.1", enabled: true, nested: { ok: true } });
    assert.deepEqual(store.get("config", "port"), 2020);
    assert.deepEqual(store.namespace("config"), { port: 2020, host: "127.0.0.1", enabled: true, nested: { ok: true } });
    assert.equal(store.delete("config", "host"), true);
    assert.equal(store.delete("config", "host"), false);
    assert.equal(store.get("config", "host"), null);
  });

  test("uses a transaction-compatible setMany path and keeps unrelated namespaces", () => {
    store.setMany("a", { one: 1, two: 2 });
    store.setMany("b", { three: 3 });
    assert.deepEqual(store.namespaceEntries(), { a: { one: 1, two: 2 }, b: { three: 3 } });
    const row = store.db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
    assert.equal(row.value, "1");
  });

  test("snapshot contains secret-free account rows and JSON namespaces", () => {
    store.set("runtime", "health", { ok: true });
    store.db.prepare(`INSERT INTO oauth_accounts
      (id, email, provider, auth_type, access_token, refresh_token, expires_at, payload_json, active, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("acct-1", "user@example.com", "openai", "api-key", "encrypted-access", "encrypted-refresh", "2030-01-01", JSON.stringify({ region: "us" }), 1, "test", 1, 2);
    const snapshot = store.snapshot();
    assert.deepEqual(snapshot.kv, { runtime: { health: { ok: true } } });
    assert.equal(snapshot.accounts.length, 1);
    assert.equal(snapshot.accounts[0].id, "acct-1");
    assert.equal(snapshot.accounts[0].payload.region, "us");
    assert.equal("access_token" in snapshot.accounts[0], false);
    assert.equal("refresh_token" in snapshot.accounts[0], false);
    assert.equal(snapshot.schemaVersion, 1);
  });

  test("encrypts and decrypts secrets with AES-256-GCM", () => {
    const encoded = encryptSecret("top-secret-token");
    assert.notEqual(encoded, "top-secret-token");
    assert.match(encoded, /aes-256-gcm/);
    assert.equal(decryptSecret(encoded), "top-secret-token");
    assert.equal(decryptSecret(null), null);
    assert.throws(() => decryptSecret("not-json"));
  });

  test("rejects missing and incorrectly sized master keys", () => {
    delete process.env.GATEWAY_CREDENTIAL_MASTER_KEY;
    assert.throws(() => encryptSecret("secret"), /required/);
    process.env.GATEWAY_CREDENTIAL_MASTER_KEY = "short";
    assert.throws(() => encryptSecret("secret"), /exactly 32 bytes/);
  });
});
