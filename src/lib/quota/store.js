/**
 * Quota management store — per-account and per-key quota tracking
 * Supports hard/soft/burst enforcement policies like OmniRoute
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".kiro-proxy");
const QUOTA_FILE = path.join(DATA_DIR, "quotas.json");

let quotas = {};
let loaded = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (loaded) return;
  ensureDir();
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      quotas = JSON.parse(fs.readFileSync(QUOTA_FILE, "utf-8"));
      if (typeof quotas !== "object") quotas = {};
    }
  } catch { quotas = {}; }
  loaded = true;
}

function save() {
  ensureDir();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(quotas, null, 2), "utf-8");
  } catch {}
}

load();

/**
 * Quota enforcement policies:
 * - hard: block requests when quota exceeded
 * - soft: allow but deprioritize when quota exceeded
 * - burst: allow using idle headroom from other keys
 */
const ENFORCEMENT_POLICIES = ["hard", "soft", "burst"];

/**
 * Time window types for quota tracking
 */
const WINDOWS = {
  "5h": 5 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const quotaStore = {
  /**
   * Set quota for an account or API key
   */
  setQuota({ id, type = "account", limits, policy = "soft" }) {
    load();

    if (!ENFORCEMENT_POLICIES.includes(policy)) {
      throw new Error(`Invalid policy: ${policy}. Must be one of: ${ENFORCEMENT_POLICIES.join(", ")}`);
    }

    quotas[id] = {
      id,
      type, // "account" or "key"
      policy,
      limits: limits || {
        requests: { "5h": null, "24h": null, "7d": null, "30d": null },
        tokens: { "5h": null, "24h": null, "7d": null, "30d": null },
        cost: { "5h": null, "24h": null, "7d": null, "30d": null },
      },
      usage: {
        requests: { "5h": [], "24h": [], "7d": [], "30d": [] },
        tokens: { "5h": [], "24h": [], "7d": [], "30d": [] },
        cost: { "5h": [], "24h": [], "7d": [], "30d": [] },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    save();
    return quotas[id];
  },

  /**
   * Get quota configuration for an ID
   */
  getQuota(id) {
    load();
    return quotas[id] || null;
  },

  /**
   * Record usage against quota
   */
  recordUsage(id, { requests = 1, tokens = 0, cost = 0 }) {
    load();

    const quota = quotas[id];
    if (!quota) return; // No quota set for this ID

    const now = Date.now();

    // Clean old entries and add new usage
    for (const window of Object.keys(WINDOWS)) {
      const cutoff = now - WINDOWS[window];

      // Clean old request entries
      quota.usage.requests[window] = quota.usage.requests[window]
        .filter(t => t > cutoff);
      quota.usage.requests[window].push(...Array(requests).fill(now));

      // Clean old token entries
      quota.usage.tokens[window] = quota.usage.tokens[window]
        .filter(e => e.timestamp > cutoff);
      if (tokens > 0) {
        quota.usage.tokens[window].push({ timestamp: now, value: tokens });
      }

      // Clean old cost entries
      quota.usage.cost[window] = quota.usage.cost[window]
        .filter(e => e.timestamp > cutoff);
      if (cost > 0) {
        quota.usage.cost[window].push({ timestamp: now, value: cost });
      }
    }

    quota.updatedAt = new Date().toISOString();
    save();
  },

  /**
   * Check if quota is exceeded
   */
  checkQuota(id) {
    load();

    const quota = quotas[id];
    if (!quota) return { allowed: true }; // No quota = unlimited

    const now = Date.now();
    const result = {
      allowed: true,
      policy: quota.policy,
      exceeded: {},
      usage: {},
      limits: quota.limits,
    };

    for (const window of Object.keys(WINDOWS)) {
      const cutoff = now - WINDOWS[window];

      // Calculate current usage
      const requestCount = quota.usage.requests[window]
        .filter(t => t > cutoff).length;

      const tokenCount = quota.usage.tokens[window]
        .filter(e => e.timestamp > cutoff)
        .reduce((sum, e) => sum + e.value, 0);

      const costSum = quota.usage.cost[window]
        .filter(e => e.timestamp > cutoff)
        .reduce((sum, e) => sum + e.value, 0);

      result.usage[window] = { requests: requestCount, tokens: tokenCount, cost: costSum };

      // Check limits
      const limits = quota.limits;
      if (limits.requests[window] && requestCount >= limits.requests[window]) {
        result.exceeded[window] = result.exceeded[window] || [];
        result.exceeded[window].push("requests");
      }
      if (limits.tokens[window] && tokenCount >= limits.tokens[window]) {
        result.exceeded[window] = result.exceeded[window] || [];
        result.exceeded[window].push("tokens");
      }
      if (limits.cost[window] && costSum >= limits.cost[window]) {
        result.exceeded[window] = result.exceeded[window] || [];
        result.exceeded[window].push("cost");
      }
    }

    // Apply policy
    if (Object.keys(result.exceeded).length > 0) {
      if (quota.policy === "hard") {
        result.allowed = false;
      } else if (quota.policy === "soft") {
        result.allowed = true;
        result.warning = "Quota exceeded but allowed (soft policy)";
      }
      // burst policy: check if there's idle headroom (not implemented yet)
    }

    return result;
  },

  /**
   * Get all quotas
   */
  getAll() {
    load();
    return Object.values(quotas);
  },

  /**
   * Remove quota
   */
  remove(id) {
    load();
    delete quotas[id];
    save();
  },

  /**
   * Clear all usage data (keep limits)
   */
  clearUsage(id) {
    load();
    const quota = quotas[id];
    if (!quota) return;

    quota.usage = {
      requests: { "5h": [], "24h": [], "7d": [], "30d": [] },
      tokens: { "5h": [], "24h": [], "7d": [], "30d": [] },
      cost: { "5h": [], "24h": [], "7d": [], "30d": [] },
    };

    quota.updatedAt = new Date().toISOString();
    save();
  },
};
