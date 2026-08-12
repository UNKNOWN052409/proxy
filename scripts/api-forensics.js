#!/usr/bin/env node
import { auditProviderEndpoint } from "../src/lib/gateway/audit.js";

const baseUrl = String(process.env.FORENSICS_BASE_URL || "").trim();
const apiKey = String(process.env.FORENSICS_API_KEY || "").trim();
const model = String(process.env.FORENSICS_MODEL || "").trim();
const probeCount = Math.max(1, Math.min(3, Number(process.env.FORENSICS_PROBES || 3)));

if (!baseUrl || !apiKey || !model) {
  console.error("Set FORENSICS_BASE_URL, FORENSICS_API_KEY, and FORENSICS_MODEL.");
  process.exit(2);
}

const provider = {
  id: "external-authorized-audit",
  type: "openai",
  baseUrl,
  defaultModel: model,
  headers: {},
};

try {
  const report = await auditProviderEndpoint({ provider, apiKey, model, probeCount });
  console.log(JSON.stringify({
    checkedAt: report.checkedAt,
    providerId: report.providerId,
    advertisedModel: report.advertisedModel,
    modelListStatus: report.modelListStatus,
    modelList: report.modelList,
    probeStatus: report.probeStatus,
    identity: report.identity,
    behavioral: report.behavioral,
    leakage: report.leakage,
    forensics: report.forensics,
    upstreamLatencyMs: report.upstreamLatencyMs,
    auditDurationMs: report.auditDurationMs,
    proxyOverheadMs: report.proxyOverheadMs,
    error: report.error || null,
    storedResponse: false,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "forensics failed" }));
  process.exit(1);
}
