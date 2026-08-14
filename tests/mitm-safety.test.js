import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { isLoopbackHost } from "../src/mitm/config.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const configUrl = pathToFileURL(resolve(testDirectory, "../src/mitm/config.js")).href;

function loadConfig(environment = {}) {
  const source = `import { MITM_CONFIG } from ${JSON.stringify(configUrl)}; console.log(JSON.stringify(MITM_CONFIG));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      ENABLE_LEGACY_MITM: "true",
      LEGACY_MITM_ACK: "I_UNDERSTAND_LOCAL_DEBUG_ONLY",
      MITM_LOCAL_TARGETS: "",
      ...environment,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("local compatibility target validation accepts only loopback names and addresses", () => {
  for (const value of ["localhost", "api.localhost", "127.0.0.1", "::1", "[::1]"]) assert.equal(isLoopbackHost(value), true, value);
  for (const value of ["kiro.dev", "api.openai.com", "example.com", "127.0.0.2", "localhost.evil.example"]) assert.equal(isLoopbackHost(value), false, value);
});

test("legacy local debug module filters third-party targets and stays disabled without a loopback allowlist", () => {
  const configuration = loadConfig({ MITM_LOCAL_TARGETS: "runtime.us-east-1.kiro.dev,api.openai.com,example.com" });
  assert.deepEqual(configuration.TARGET_HOSTS, []);
  assert.equal(configuration.ENABLED, false);
  assert.equal(configuration.ROUTER_BASE, "http://localhost:2018");
  assert.deepEqual(configuration.HOST_REWRITE, {});
});

test("legacy local debug module permits only an explicit bounded loopback target list", () => {
  const configuration = loadConfig({ MITM_LOCAL_TARGETS: "localhost,api.localhost,127.0.0.1,::1,api.openai.com" });
  assert.deepEqual(configuration.TARGET_HOSTS, ["localhost", "api.localhost", "127.0.0.1", "::1"]);
  assert.equal(configuration.ENABLED, true);
});
