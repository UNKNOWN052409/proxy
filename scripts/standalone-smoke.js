import { spawn } from "node:child_process";
import { createKey } from "../src/lib/api-keys/store.js";
import { generateApiKey } from "../src/lib/api-keys/generator.js";

const generated = generateApiKey({ name: "standalone-smoke", expiresInDays: 1 });
createKey({ key: generated.key, name: "standalone-smoke", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
const child = spawn("node", ["src/gateway-server.js"], { env: { ...process.env, GATEWAY_CREDENTIAL_MASTER_KEY: "11".repeat(32) }, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await wait(1800);
  const port = Number((logs.match(/127\.0\.0\.1:(\d+)/) || [])[1] || 2018);
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  const models = await fetch(`http://127.0.0.1:${port}/v1/models`, { headers: { Authorization: `Bearer ${generated.key}` } });
  const memory = process.resourceUsage();
  console.log(JSON.stringify({ port, healthStatus: health.status, modelsStatus: models.status, rssKb: memory.maxRSS, logs: logs.slice(0, 500) }, null, 2));
} finally {
  child.kill("SIGTERM");
  await wait(300);
}
