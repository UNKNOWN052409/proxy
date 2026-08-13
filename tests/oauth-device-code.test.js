import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { __testables, pollOAuthDeviceAuthorization, startOAuthDeviceAuthorization } from "../src/lib/gateway/oauth.js";

const { STATE_PATH } = __testables;
const provider = {
  id: "device-test",
  oauthDeviceCodeUrl: "https://oauth.example.test/device",
  oauthTokenUrl: "https://oauth.example.test/token",
  oauthScopes: ["inference-api"],
  oauthTokenContentType: "form",
};

function backupState() {
  return fs.existsSync(STATE_PATH) ? fs.readFileSync(STATE_PATH, "utf8") : null;
}

function restoreState(previous) {
  if (previous === null) fs.rmSync(STATE_PATH, { force: true });
  else {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, previous, { mode: 0o600 });
  }
}

function makeResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

function forcePollNow(state) {
  const all = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  all[state].nextPollAt = 0;
  fs.writeFileSync(STATE_PATH, JSON.stringify(all), { mode: 0o600 });
}

test("device authorization stores an opaque state, enforces polling interval, and imports only a successful official token", async () => {
  const previous = backupState();
  const originalFetch = globalThis.fetch;
  const imported = [];
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/device")) return makeResponse(200, { device_code: "never-return-device-code", user_code: "SAFE-CODE", verification_uri: "https://verify.example.test", expires_in: 300, interval: 2 });
      return makeResponse(200, { access_token: "test-access-token", refresh_token: "test-refresh-token", expires_in: 60, token_type: "Bearer" });
    };
    const started = await startOAuthDeviceAuthorization({ provider, clientId: "client-id" });
    assert.equal(started.userCode, "SAFE-CODE");
    assert.equal(Object.hasOwn(started, "deviceCode"), false);
    const early = await pollOAuthDeviceAuthorization({ provider, state: started.state, clientId: "client-id", importCredentials: (_id, entries) => { imported.push(...entries); return [{ id: "credential-id" }]; } });
    assert.equal(early.pending, true);
    forcePollNow(started.state);
    const completed = await pollOAuthDeviceAuthorization({ provider, state: started.state, clientId: "client-id", importCredentials: (_id, entries) => { imported.push(...entries); return [{ id: "credential-id" }]; } });
    assert.equal(completed.authorized, true);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].apiKey, "test-access-token");
    assert.equal(imported[0].refreshToken, "test-refresh-token");
  } finally {
    globalThis.fetch = originalFetch;
    restoreState(previous);
  }
});

test("device authorization returns a bounded retry window for an official authorization_pending response", async () => {
  const previous = backupState();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => String(url).endsWith("/device")
      ? makeResponse(200, { device_code: "opaque", user_code: "PENDING-CODE", verification_uri: "https://verify.example.test", expires_in: 300, interval: 2 })
      : makeResponse(400, { error: "authorization_pending" });
    const started = await startOAuthDeviceAuthorization({ provider, clientId: "client-id" });
    forcePollNow(started.state);
    const pending = await pollOAuthDeviceAuthorization({ provider, state: started.state, clientId: "client-id" });
    assert.equal(pending.authorized, false);
    assert.equal(pending.pending, true);
    assert.equal(pending.retryAfterSeconds, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreState(previous);
  }
});
