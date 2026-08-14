import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "gateway-config-test-"));
process.env.GATEWAY_SQLITE_PATH = join(dir, "config.db");
const { userConfig } = await import("../src/lib/config/store.js");

before(() => userConfig.reset());
after(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.GATEWAY_SQLITE_PATH;
});

test("SQL config store exposes defaults and persists scalar/object values", () => {
  const initial = userConfig.get();
  assert.equal(initial.port, 2018);
  assert.equal(userConfig.hasPassword(), false);
  userConfig.set("port", 2100);
  userConfig.setAll({ tunnelProvider: "cloudflare", tunnelStatus: "running", flags: { healthy: true } });
  assert.equal(userConfig.get().port, 2100);
  assert.deepEqual(userConfig.get().flags, { healthy: true });
});

test("password hashing verifies correctly without storing plaintext", () => {
  userConfig.setPassword("correct horse battery staple");
  assert.equal(userConfig.hasPassword(), true);
  assert.equal(userConfig.verifyPassword("correct horse battery staple"), true);
  assert.equal(userConfig.verifyPassword("wrong"), false);
  assert.notEqual(userConfig.get().passwordHash, "correct horse battery staple");
});

test("tunnel and domain helpers update SQL state", () => {
  userConfig.setTunnelInfo("https://tunnel.example", 1234);
  assert.deepEqual({
    tunnelEnabled: userConfig.get().tunnelEnabled,
    tunnelUrl: userConfig.get().tunnelUrl,
    tunnelProcessId: userConfig.get().tunnelProcessId,
  }, { tunnelEnabled: true, tunnelUrl: "https://tunnel.example", tunnelProcessId: 1234 });
  userConfig.setCustomDomain("api.example.com");
  assert.equal(userConfig.get().customDomain, "api.example.com");
  userConfig.clearTunnelInfo();
  assert.equal(userConfig.get().tunnelEnabled, false);
  assert.equal(userConfig.get().tunnelUrl, null);
});

test("reset clears SQL keys and restores defaults", () => {
  userConfig.reset();
  const config = userConfig.get();
  assert.equal(config.port, 2018);
  assert.equal(config.passwordHash, null);
  assert.equal(config.tunnelProvider, null);
  assert.equal(userConfig.verifyPassword("anything"), true);
});
