/**
 * Persistent usage tracker — records proxy requests to ~/.kiro-proxy/usage.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

let usageLog = [];
let loaded = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (loaded) return;
  ensureDir();
  try {
    if (fs.existsSync(USAGE_FILE)) {
      usageLog = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
      if (!Array.isArray(usageLog)) usageLog = [];
    }
  } catch { usageLog = []; }
  loaded = true;
}

function save() {
  ensureDir();
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usageLog, null, 2), "utf-8");
  } catch {}
}

load();

export const usageStore = {
  /**
   * Record a proxy request
   */
  record({ model, provider, tokens, duration, success = true, error = null }) {
    load();
    usageLog.push({
      id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      model: model || "unknown",
      provider: provider || "unknown",
      tokens: tokens || 0,
      duration: duration || 0,
      success,
      error,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
    });

    // Keep last 100k entries, prune old ones
    if (usageLog.length > 100000) {
      usageLog = usageLog.slice(-100000);
    }

    save();
  },

  /**
   * Get all usage records
   */
  getAll() {
    load();
    return [...usageLog];
  },

  /**
   * Get summary stats
   * @param {number} days - Number of days to include (default: all data)
   */
  getSummary(days = null) {
    load();

    // Filter by time period if specified
    const cutoffTime = days ? Date.now() - (days * 24 * 60 * 60 * 1000) : 0;
    const filteredLog = days
      ? usageLog.filter(u => new Date(u.timestamp).getTime() >= cutoffTime)
      : usageLog;

    const total = filteredLog.length;
    const successful = filteredLog.filter(u => u.success).length;
    const failed = total - successful;

    // Per-model
    const modelStats = {};
    // Per-provider
    const providerStats = {};
    // Per-day
    const dailyStats = {};
    // Total tokens
    let totalTokens = 0;

    for (const u of filteredLog) {
      if (!modelStats[u.model]) modelStats[u.model] = { count: 0, tokens: 0 };
      modelStats[u.model].count++;
      modelStats[u.model].tokens += u.tokens || 0;

      if (!providerStats[u.provider]) providerStats[u.provider] = { count: 0, tokens: 0 };
      providerStats[u.provider].count++;
      providerStats[u.provider].tokens += u.tokens || 0;

      if (!dailyStats[u.date]) dailyStats[u.date] = { count: 0, tokens: 0 };
      dailyStats[u.date].count++;
      dailyStats[u.date].tokens += u.tokens || 0;

      totalTokens += u.tokens || 0;
    }

    // Last 24h (from filtered data)
    const last24hTime = Date.now() - (24 * 60 * 60 * 1000);
    const last24h = filteredLog.filter(u => {
      return new Date(u.timestamp).getTime() >= last24hTime;
    }).length;

    return {
      total,
      successful,
      failed,
      totalTokens,
      last24h,
      models: modelStats,
      providers: providerStats,
      daily: Object.entries(dailyStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, stats]) => ({ date, ...stats })),
    };
  },

  /**
   * Clear all usage data
   */
  clear() {
    load();
    usageLog = [];
    save();
  },
};
