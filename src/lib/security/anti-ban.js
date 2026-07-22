/**
 * Security & anti-ban features
 * Prevents provider detection and account bans through intelligent rate limiting,
 * request distribution, and fingerprint randomization (OmniRoute-inspired)
 */

import crypto from "crypto";

/**
 * Rate limiter with per-provider sliding window
 * Prevents hitting rate limits that trigger bans
 */
class RateLimiter {
  constructor() {
    this.windows = new Map(); // provider -> { window, requests[] }
  }

  /**
   * Check if request is allowed under rate limit
   */
  checkLimit(providerId, limits = {}) {
    const {
      rpm = 60, // requests per minute
      rph = 3600, // requests per hour
      rpd = 10000, // requests per day
    } = limits;

    const now = Date.now();
    if (!this.windows.has(providerId)) {
      this.windows.set(providerId, { requests: [] });
    }

    const window = this.windows.get(providerId);

    // Clean old requests
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    window.requests = window.requests.filter(t => t > oneDayAgo);

    // Count requests in each window
    const lastMinute = window.requests.filter(t => t > oneMinuteAgo).length;
    const lastHour = window.requests.filter(t => t > oneHourAgo).length;
    const lastDay = window.requests.length;

    // Check limits
    if (rpm && lastMinute >= rpm) {
      return { allowed: false, reason: "RPM limit exceeded", retryAfter: 60 };
    }
    if (rph && lastHour >= rph) {
      return { allowed: false, reason: "RPH limit exceeded", retryAfter: 3600 };
    }
    if (rpd && lastDay >= rpd) {
      return { allowed: false, reason: "RPD limit exceeded", retryAfter: 86400 };
    }

    return { allowed: true };
  }

  /**
   * Record a request
   */
  recordRequest(providerId) {
    if (!this.windows.has(providerId)) {
      this.windows.set(providerId, { requests: [] });
    }
    this.windows.get(providerId).requests.push(Date.now());
  }
}

/**
 * Request distributor - spreads requests across multiple accounts
 * Prevents single-account overuse that triggers bans
 */
class RequestDistributor {
  constructor() {
    this.accountUsage = new Map(); // accountId -> { count, lastUsed }
  }

  /**
   * Select best account for next request (least recently used)
   */
  selectAccount(accounts, providerId) {
    if (!accounts || accounts.length === 0) return null;

    // Filter active accounts for this provider
    const eligible = accounts.filter(a =>
      a.active && a.provider === providerId
    );

    if (eligible.length === 0) return null;
    if (eligible.length === 1) return eligible[0];

    // Round-robin with least-recently-used priority
    const sorted = eligible.sort((a, b) => {
      const usageA = this.accountUsage.get(a.id) || { count: 0, lastUsed: 0 };
      const usageB = this.accountUsage.get(b.id) || { count: 0, lastUsed: 0 };
      return usageA.lastUsed - usageB.lastUsed;
    });

    return sorted[0];
  }

  /**
   * Record account usage
   */
  recordUsage(accountId) {
    const usage = this.accountUsage.get(accountId) || { count: 0, lastUsed: 0 };
    usage.count++;
    usage.lastUsed = Date.now();
    this.accountUsage.set(accountId, usage);
  }

  /**
   * Get usage stats for an account
   */
  getUsage(accountId) {
    return this.accountUsage.get(accountId) || { count: 0, lastUsed: 0 };
  }
}

/**
 * User-Agent rotation - prevents fingerprinting via consistent UA
 */
const USER_AGENTS = {
  vscode: [
    "Visual Studio Code/1.95.0",
    "Visual Studio Code/1.94.2",
    "Visual Studio Code/1.93.1",
  ],
  cursor: [
    "Cursor/0.42.0",
    "Cursor/0.41.5",
    "Cursor/0.40.3",
  ],
  cline: [
    "Cline/3.2.0",
    "Cline/3.1.5",
  ],
  claude: [
    "Claude-Code/2.1.215",
    "Claude-Code/2.1.200",
  ],
  codex: [
    "codex_cli_rs/0.136.0",
    "codex_cli_rs/0.135.8",
  ],
};

function getRandomUserAgent(type = "vscode") {
  const agents = USER_AGENTS[type] || USER_AGENTS.vscode;
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * Request jitter - adds random delays to prevent timing-based detection
 */
function addJitter(baseDelay = 0, maxJitter = 500) {
  const jitter = Math.floor(Math.random() * maxJitter);
  return baseDelay + jitter;
}

/**
 * Ban detector - identifies when an account gets banned/rate-limited
 */
class BanDetector {
  constructor() {
    this.failures = new Map(); // accountId -> { count, lastFailure, banned }
  }

  /**
   * Record a failed request
   */
  recordFailure(accountId, statusCode, error) {
    const failure = this.failures.get(accountId) || {
      count: 0,
      lastFailure: 0,
      banned: false
    };

    failure.count++;
    failure.lastFailure = Date.now();

    // Ban indicators
    const banPatterns = [
      statusCode === 429, // Rate limit
      statusCode === 403, // Forbidden
      error?.includes("rate limit"),
      error?.includes("too many requests"),
      error?.includes("banned"),
      error?.includes("suspended"),
    ];

    if (banPatterns.some(Boolean)) {
      failure.banned = true;
    }

    // Auto-unban after 1 hour
    if (failure.banned && Date.now() - failure.lastFailure > 60 * 60 * 1000) {
      failure.banned = false;
      failure.count = 0;
    }

    this.failures.set(accountId, failure);
    return failure;
  }

  /**
   * Check if account is banned
   */
  isBanned(accountId) {
    const failure = this.failures.get(accountId);
    return failure?.banned || false;
  }

  /**
   * Get failure stats
   */
  getStats(accountId) {
    return this.failures.get(accountId) || { count: 0, lastFailure: 0, banned: false };
  }
}

/**
 * Request ID generator - creates unique IDs for request tracing
 */
function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// Singleton instances
export const rateLimiter = new RateLimiter();
export const requestDistributor = new RequestDistributor();
export const banDetector = new BanDetector();

export {
  RateLimiter,
  RequestDistributor,
  BanDetector,
  getRandomUserAgent,
  addJitter,
  generateRequestId,
};
