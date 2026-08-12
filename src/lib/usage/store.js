/**
 * Persistent usage tracker — records proxy requests to ~/.kiro-proxy/usage.json.
 */
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");
let usageLog = [];
let loaded = false;

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function load() {
  if (loaded) return;
  ensureDir();
  try { if (fs.existsSync(USAGE_FILE)) { usageLog = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8")); if (!Array.isArray(usageLog)) usageLog = []; } } catch { usageLog = []; }
  loaded = true;
}
function save() { ensureDir(); try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usageLog, null, 2), "utf-8"); } catch {} }
function createMetric() { return { count: 0, tokens: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, successful: 0, failed: 0, durationTotal: 0 }; }
function addMetric(metric, usage) {
  metric.count++;
  const inputTokens = Number(usage.inputTokens) || 0;
  const outputTokens = Number(usage.outputTokens) || 0;
  metric.inputTokens += inputTokens;
  metric.outputTokens += outputTokens;
  metric.tokens += Number(usage.tokens) || inputTokens + outputTokens;
  metric.costUsd += Number(usage.costUsd) || 0;
  metric.durationTotal += Math.max(0, Number(usage.duration) || 0);
  if (usage.success) metric.successful++; else metric.failed++;
}
function finishMetric(metric) {
  return { ...metric, costUsd: Number(metric.costUsd.toFixed(8)), averageLatencyMs: metric.count ? Math.round(metric.durationTotal / metric.count) : 0, successRate: metric.count ? Number((metric.successful / metric.count).toFixed(4)) : 0 };
}

load();

export const usageStore = {
  record({ model, provider, tokens, inputTokens = 0, outputTokens = 0, costUsd = 0, duration, success = true, error = null }) {
    load();
    const normalizedInput = Number(inputTokens) || 0;
    const normalizedOutput = Number(outputTokens) || 0;
    usageLog.push({ id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, model: model || "unknown", provider: provider || "unknown", tokens: Number(tokens) || normalizedInput + normalizedOutput, inputTokens: normalizedInput, outputTokens: normalizedOutput, costUsd: Number(costUsd) || 0, duration: Math.max(0, Number(duration) || 0), success: Boolean(success), error: error ? String(error).slice(0, 500) : null, timestamp: new Date().toISOString(), date: new Date().toISOString().split("T")[0] });
    if (usageLog.length > 100000) usageLog = usageLog.slice(-100000);
    save();
  },

  getAll() { load(); return [...usageLog]; },

  getSummary(days = null) {
    load();
    const cutoffTime = days ? Date.now() - (days * 24 * 60 * 60 * 1000) : 0;
    const filteredLog = days ? usageLog.filter((usage) => new Date(usage.timestamp).getTime() >= cutoffTime) : usageLog;
    const models = {}, providers = {}, daily = {};
    const overall = createMetric();
    for (const usage of filteredLog) {
      if (!models[usage.model]) models[usage.model] = createMetric();
      if (!providers[usage.provider]) providers[usage.provider] = createMetric();
      if (!daily[usage.date]) daily[usage.date] = createMetric();
      addMetric(overall, usage); addMetric(models[usage.model], usage); addMetric(providers[usage.provider], usage); addMetric(daily[usage.date], usage);
    }
    const last24hTime = Date.now() - (24 * 60 * 60 * 1000);
    const last24h = filteredLog.filter((usage) => new Date(usage.timestamp).getTime() >= last24hTime).length;
    return {
      total: overall.count,
      successful: overall.successful,
      failed: overall.failed,
      totalTokens: overall.tokens,
      inputTokens: overall.inputTokens,
      outputTokens: overall.outputTokens,
      costUsd: Number(overall.costUsd.toFixed(8)),
      averageLatencyMs: finishMetric(overall).averageLatencyMs,
      successRate: finishMetric(overall).successRate,
      last24h,
      models: Object.fromEntries(Object.entries(models).map(([key, value]) => [key, finishMetric(value)])),
      providers: Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, finishMetric(value)])),
      daily: Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, value]) => ({ date, ...finishMetric(value) })),
    };
  },

  clear() { load(); usageLog = []; save(); },
};
