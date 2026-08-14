#!/usr/bin/env node
/**
 * Controlled, opt-in live benchmark for an authorized OpenAI-compatible upstream.
 * It runs the actual standalone gateway in an isolated HOME directory, never logs
 * upstream or gateway keys, and writes only aggregate metrics to the repository.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(root, "docs");
const outputPath = process.env.BENCHMARK_OUTPUT || path.join(reportsDir, "authorized-gateway-benchmark.json");
const port = Number(process.env.BENCHMARK_GATEWAY_PORT || 24118);
const model = String(process.env.BENCHMARK_MODEL || "").trim();
const stages = String(process.env.BENCHMARK_RPM_STAGES || "10,100,500")
  .split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
const durationSeconds = Math.max(1, Number(process.env.BENCHMARK_STAGE_SECONDS || 60));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function percentile(values, at) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Math.round(ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * at) - 1))] * 10) / 10;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForGateway(baseUrl, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = "not started";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      latest = `HTTP ${response.status}`;
    } catch (error) { latest = error.name || "connection error"; }
    await sleep(150);
  }
  throw new Error(`Standalone gateway did not become healthy: ${latest}`);
}

async function stage({ baseUrl, gatewayApiKey, providerModel, rpm }) {
  const requestCount = Math.max(1, Math.round((rpm * durationSeconds) / 60));
  const intervalMs = (durationSeconds * 1000) / requestCount;
  const results = [];
  const startedAt = performance.now();
  const request = async (index) => {
    const due = startedAt + index * intervalMs;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    const requestStarted = performance.now();
    let response;
    let body = null;
    let transportError = null;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayApiKey}`,
          "Idempotency-Key": `benchmark-${rpm}-${index}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          model: providerModel,
          messages: [{ role: "user", content: "Reply exactly with: ok" }],
          max_tokens: 3,
          temperature: 0,
          stream: false,
        }),
      });
      const text = await response.text();
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    } catch (error) { transportError = error?.name || "request_error"; }
    const latencyMs = performance.now() - requestStarted;
    results.push({
      status: response?.status || null,
      latencyMs,
      transportError,
      openAiShape: Boolean(body && Array.isArray(body.choices)),
      errorType: typeof body?.error?.type === "string" ? body.error.type : null,
    });
  };
  await Promise.all(Array.from({ length: requestCount }, (_, index) => request(index)));
  const latency = results.map((item) => item.latencyMs);
  const statuses = {};
  const errors = {};
  for (const item of results) {
    const key = item.status ? String(item.status) : `transport:${item.transportError || "unknown"}`;
    statuses[key] = (statuses[key] || 0) + 1;
    if (item.errorType) errors[item.errorType] = (errors[item.errorType] || 0) + 1;
  }
  const success = results.filter((item) => item.status && item.status >= 200 && item.status < 300 && item.openAiShape).length;
  return {
    requestedRpm: rpm,
    durationSeconds,
    requestCount,
    successfulOpenAiResponses: success,
    successRate: Math.round((success / requestCount) * 10_000) / 100,
    statusCounts: statuses,
    errorTypeCounts: errors,
    latencyMs: { min: Math.round(Math.min(...latency) * 10) / 10, p50: percentile(latency, 0.5), p95: percentile(latency, 0.95), max: Math.round(Math.max(...latency) * 10) / 10 },
  };
}

async function main() {
  const upstreamBaseUrl = required("BENCHMARK_UPSTREAM_BASE_URL");
  const upstreamApiKey = required("BENCHMARK_UPSTREAM_API_KEY");
  if (!model) throw new Error("BENCHMARK_MODEL is required");
  if (!stages.length) throw new Error("BENCHMARK_RPM_STAGES must contain a positive RPM stage");
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "compliant-gateway-benchmark-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    BENCHMARK_UPSTREAM_BASE_URL: upstreamBaseUrl,
    BENCHMARK_UPSTREAM_API_KEY: upstreamApiKey,
    GATEWAY_BENCHMARK_UPSTREAM_API_KEY: upstreamApiKey,
    BENCHMARK_MODEL: model,
    GATEWAY_HOST: "127.0.0.1",
    GATEWAY_PORT: String(port),
    GATEWAY_MODEL_REFRESH_SCHEDULER: "false",
  };
  let child = null;
  let sampler = null;
  const rssSamplesKb = [];
  const createdAt = new Date().toISOString();
  try {
    const setup = spawnSync(process.execPath, [path.join(root, "scripts", "prepare-isolated-benchmark-runtime.js")], { cwd: root, env: environment, encoding: "utf8", timeout: 15_000 });
    if (setup.status !== 0) throw new Error(`Benchmark setup failed: ${String(setup.stderr || setup.stdout || "unknown error").trim()}`);
    const setupResult = JSON.parse(setup.stdout.trim());
    child = spawn(process.execPath, [path.join(root, "src", "gateway-server.js")], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let startupLogs = "";
    child.stdout.on("data", (chunk) => { startupLogs = `${startupLogs}${chunk}`.slice(-2000); });
    child.stderr.on("data", (chunk) => { startupLogs = `${startupLogs}${chunk}`.slice(-2000); });
    await waitForGateway(baseUrl);
    sampler = setInterval(() => {
      const sample = spawnSync("ps", ["-o", "rss=", "-p", String(child.pid)], { encoding: "utf8" });
      const rss = Number(String(sample.stdout || "").trim());
      if (Number.isFinite(rss) && rss > 0) rssSamplesKb.push(rss);
    }, 250);
    const stageResults = [];
    for (const rpm of stages) stageResults.push(await stage({ baseUrl, gatewayApiKey: setupResult.gatewayApiKey, providerModel: `${setupResult.provider}/${setupResult.model}`, rpm }));
    const report = {
      createdAt,
      target: { surface: "standalone /v1/chat/completions", upstream: "authorized OpenAI-compatible endpoint", modelConfigured: true },
      stages: stageResults,
      gatewayRssMiB: {
        samples: rssSamplesKb.length,
        peak: rssSamplesKb.length ? Math.round((Math.max(...rssSamplesKb) / 1024) * 100) / 100 : null,
        p50: rssSamplesKb.length ? Math.round((percentile(rssSamplesKb, 0.5) / 1024) * 100) / 100 : null,
      },
      notes: [
        "No credential, endpoint URL, gateway API key, request prompts, or upstream response text is written to this report.",
        "A non-2xx result is reported as upstream/gateway evidence, not silently counted as success.",
        "This benchmark uses an isolated temporary HOME and removes all generated gateway state when it exits.",
      ],
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ report: outputPath, stages: stageResults.map((entry) => ({ rpm: entry.requestedRpm, successRate: entry.successRate, statuses: entry.statusCounts })), peakRssMiB: report.gatewayRssMiB.peak }, null, 2)}\n`);
  } finally {
    if (sampler) clearInterval(sampler);
    if (child && !child.killed) {
      child.kill("SIGTERM");
      await sleep(300);
      if (!child.killed) child.kill("SIGKILL");
    }
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed");
  process.exitCode = 1;
});
