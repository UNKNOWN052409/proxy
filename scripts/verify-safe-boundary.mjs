import assert from "node:assert/strict";
import { normalizeOpenCodeImport } from "../src/lib/gateway/opencode-import.js";

const local = normalizeOpenCodeImport({
  providers: [{ id: "local-opencode", type: "openai", baseUrl: "http://127.0.0.1:2018/v1", models: ["local-model"] }],
});
assert.equal(local[0].baseUrl, "http://127.0.0.1:2018/v1");
assert.equal(local[0].importSource, "opencode-safe-config");
assert.throws(() => normalizeOpenCodeImport({ providers: [{ id: "public-http", type: "openai", baseUrl: "http://example.com/v1" }] }));
assert.throws(() => normalizeOpenCodeImport({ providers: [{ id: "secret-bearing", type: "openai", baseUrl: "https://example.com/v1", apiKey: "should-be-rejected" }] }));
console.log(JSON.stringify({ ok: true, localNoAuthMetadataOnly: true, publicHttpRejected: true, secretBearingImportRejected: true }));
