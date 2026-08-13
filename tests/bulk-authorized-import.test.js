import assert from "node:assert/strict";
import test from "node:test";
import { importAuthorizedBulkPlan, parseAuthorizedImportText, summarizeAuthorizedImport } from "../src/lib/gateway/bulk-import.js";

test("bulk JSON bundle accepts API keys, bearer tokens, and official OAuth accounts", () => {
  const plan = parseAuthorizedImportText(JSON.stringify({
    provider: "kiro",
    credentials: [{ label: "paid-key", apiKey: "kiro-api-key" }, { label: "issued-token", token: "kiro-issued-token" }],
    accounts: [{ email: "owner@example.test", accessToken: "official-access", refreshToken: "official-refresh", label: "Owner OAuth" }],
  }), { fileName: "authorized.json" });

  assert.equal(plan.credentials.length, 2);
  assert.equal(plan.accounts.length, 1);
  assert.deepEqual(plan.credentials.map((entry) => entry.providerId), ["kiro", "kiro"]);
  assert.equal(plan.accounts[0].provider, "kiro");
  const preview = summarizeAuthorizedImport(plan);
  assert.deepEqual(preview, {
    credentialEntries: 2,
    accountEntries: 1,
    rejectedEntries: 0,
    credentialProviders: ["kiro"],
    accountProviders: ["kiro"],
  });
  assert.equal(JSON.stringify(preview).includes("kiro-api-key"), false);
  assert.equal(JSON.stringify(preview).includes("official-access"), false);
});

test("bulk CSV accepts per-row provider and quoted labels without rendering secrets in the summary", () => {
  const plan = parseAuthorizedImportText("provider,token,label\nopenai,issued-openai-token,\"Primary, paid\"\nkiro,issued-kiro-token,Kiro token\n", { fileName: "keys.csv" });
  assert.equal(plan.credentials.length, 2);
  assert.deepEqual(plan.credentials.map((entry) => entry.providerId), ["openai", "kiro"]);
  assert.equal(plan.credentials[0].entry.label, "Primary, paid");
  assert.equal(JSON.stringify(summarizeAuthorizedImport(plan)).includes("issued-openai-token"), false);
});

test("plain token list requires a default provider and ignores comments", () => {
  assert.throws(() => parseAuthorizedImportText("first-token\nsecond-token", { fileName: "tokens.txt" }), /provider ID/i);
  const plan = parseAuthorizedImportText("# owned provider tokens\nfirst-token\n\nsecond-token\n", { fileName: "tokens.txt", providerId: "mistral" });
  assert.equal(plan.credentials.length, 2);
  assert.equal(plan.credentials[1].entry.token, "second-token");
});

test("private browser and password material is rejected while safe entries remain available", () => {
  const plan = parseAuthorizedImportText(JSON.stringify({
    credentials: [
      { provider: "kiro", token: "safe-token" },
      { provider: "kiro", token: "unsafe-token", cookies: "browser-cookie" },
      { provider: "openai", apiKey: "unsafe-key", password: "not-accepted" },
    ],
  }), { fileName: "mixed.json" });
  assert.equal(plan.credentials.length, 1);
  assert.equal(plan.rejected.length, 2);
  assert.match(plan.rejected[0].error, /not accepted/i);
});

test("safe nested cliProxyAuth connection maps explicit OAuth tokens without copying other account secrets", () => {
  const plan = parseAuthorizedImportText(JSON.stringify({
    connections: [{
      provider: "kiro",
      label: "CLI connection",
      cliProxyAuth: { email: "owner@example.test", accessToken: "official-token", refreshToken: "official-refresh" },
      providerSpecificData: { accountId: "owned-account" },
    }],
  }), { fileName: "connections.json" });
  assert.equal(plan.accounts.length, 1);
  assert.equal(plan.accounts[0].accessToken, "official-token");
  assert.equal(plan.accounts[0].email, "owner@example.test");
});

test("bulk import executor returns only metadata from injected encrypted stores", () => {
  const plan = parseAuthorizedImportText(JSON.stringify({
    credentials: [{ provider: "kiro", token: "secret-token", label: "Kiro" }],
    accounts: [{ provider: "kiro", accessToken: "secret-access", email: "owner@example.test" }],
  }), { fileName: "bundle.json" });
  const result = importAuthorizedBulkPlan(plan, {
    credentialImporter(providerId, entries) {
      assert.equal(providerId, "kiro");
      assert.equal(entries[0].token, "secret-token");
      return [{ id: "credential-id", providerId, label: "Kiro" }];
    },
    accountImporter(entries) {
      assert.equal(entries[0].accessToken, "secret-access");
      return { success: 1, failed: 0, results: [{ ok: true, id: "account-id", email: "owner@example.test" }] };
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.imported, 2);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
  assert.equal(JSON.stringify(result).includes("secret-access"), false);
});
