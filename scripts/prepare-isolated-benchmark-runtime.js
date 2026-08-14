#!/usr/bin/env node
/**
 * Prepares a disposable standalone-gateway state directory for controlled
 * upstream benchmarking. Run this only from an isolated working directory.
 * The upstream credential stays in the child process environment and is never
 * written by this script.
 */
import { generateApiKey } from "../src/lib/api-keys/generator.js";
import { createKey } from "../src/lib/api-keys/store.js";
import { mergeProviderConfiguration } from "../src/lib/gateway/runtime-store.js";

const baseUrl = String(process.env.BENCHMARK_UPSTREAM_BASE_URL || "").trim().replace(/\/$/, "");
const model = String(process.env.BENCHMARK_MODEL || "").trim();
if (!baseUrl) throw new Error("BENCHMARK_UPSTREAM_BASE_URL is required");
if (!model) throw new Error("BENCHMARK_MODEL is required");
if (!process.env.BENCHMARK_UPSTREAM_API_KEY) throw new Error("BENCHMARK_UPSTREAM_API_KEY is required");

mergeProviderConfiguration({
  id: "authorized-benchmark",
  label: "Authorized benchmark upstream",
  type: "openai",
  baseUrl,
  apiKeyEnv: "GATEWAY_BENCHMARK_UPSTREAM_API_KEY",
  models: [model],
  defaultModel: model,
  enabled: true,
  supportsTools: true,
  supportsVision: false,
  routingPriority: 1,
});

const generated = generateApiKey({ name: "isolated-authorized-benchmark", expiresInDays: 1 });
createKey({ ...generated, provider_ids: ["authorized-benchmark"], model_ids: [model], rpm_limit: 0, token_limit: 0 });
process.stdout.write(JSON.stringify({ gatewayApiKey: generated.key, provider: "authorized-benchmark", model }) + "\n");
