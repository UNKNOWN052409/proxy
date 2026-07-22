/**
 * Rate Limiter - Tier-based request rate limiting with sliding window
 *
 * Implements per-tier rate limiting to prevent abuse and ensure fair resource allocation.
 * Uses sliding window algorithm to track requests within a time window.
 */

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed - Whether the request is allowed
 * @property {number} remaining - Number of requests remaining in current window
 * @property {number} resetAt - Timestamp (ms) when the rate limit window resets
 * @property {number} limit - Total limit for this tier
 */

/**
 * @typedef {Object} TierConfig
 * @property {number} limit - Maximum requests per window (0 = unlimited)
 * @property {number} windowMs - Time window in milliseconds
 */

/**
 * Default tier configurations
 */
const DEFAULT_TIERS = {
  free: {
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  pro: {
    limit: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  enterprise: {
    limit: 1000,
    windowMs: 60 * 1000, // 1 minute
  },
};

/**
 * RateLimiter class - Manages rate limiting across multiple accounts and tiers
 */
export class RateLimiter {
  /**
   * @param {Object} options - Configuration options
   * @param {Object.<string, TierConfig>} options.tiers - Custom tier configurations
   */
  constructor(options = {}) {
    this.tiers = options.tiers || DEFAULT_TIERS;

    // Map to track requests: key = `${tier}:${accountId}`, value = array of timestamps
    this.requestTracker = new Map();

    // Cleanup interval to remove old entries
    this.cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.startCleanup();
  }

  /**
   * Check if a request is allowed under the rate limit
   *
   * @param {string} tier - Account tier (free, pro, enterprise)
   * @param {string} accountId - Unique account identifier
   * @returns {RateLimitResult} Rate limit check result
   */
  checkLimit(tier, accountId = 'default') {
    const tierConfig = this.getTierConfig(tier);

    // Unlimited tier - always allow
    if (tierConfig.limit === 0) {
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: Date.now() + tierConfig.windowMs,
        limit: Infinity,
      };
    }

    const key = this.getKey(tier, accountId);
    const now = Date.now();
    const windowStart = now - tierConfig.windowMs;

    // Get existing timestamps for this key
    let timestamps = this.requestTracker.get(key) || [];

    // Remove timestamps outside the current window (sliding window)
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    const requestCount = timestamps.length;
    const allowed = requestCount < tierConfig.limit;

    // Calculate remaining requests
    const remaining = Math.max(0, tierConfig.limit - requestCount);

    // Calculate reset time (oldest request + window)
    let resetAt;
    if (timestamps.length > 0) {
      resetAt = timestamps[0] + tierConfig.windowMs;
    } else {
      resetAt = now + tierConfig.windowMs;
    }

    // If allowed, add current timestamp
    if (allowed) {
      timestamps.push(now);
      this.requestTracker.set(key, timestamps);
    }

    return {
      allowed,
      remaining: allowed ? remaining - 1 : remaining,
      resetAt,
      limit: tierConfig.limit,
    };
  }

  /**
   * Record a request (for manual tracking without checking limit)
   *
   * @param {string} tier - Account tier
   * @param {string} accountId - Account identifier
   */
  recordRequest(tier, accountId = 'default') {
    const key = this.getKey(tier, accountId);
    const now = Date.now();

    let timestamps = this.requestTracker.get(key) || [];
    timestamps.push(now);

    this.requestTracker.set(key, timestamps);
  }

  /**
   * Get current usage for an account
   *
   * @param {string} tier - Account tier
   * @param {string} accountId - Account identifier
   * @returns {Object} Usage information
   */
  getUsage(tier, accountId = 'default') {
    const tierConfig = this.getTierConfig(tier);
    const key = this.getKey(tier, accountId);
    const now = Date.now();
    const windowStart = now - tierConfig.windowMs;

    let timestamps = this.requestTracker.get(key) || [];
    timestamps = timestamps.filter(ts => ts > windowStart);

    return {
      count: timestamps.length,
      limit: tierConfig.limit,
      remaining: tierConfig.limit === 0 ? Infinity : Math.max(0, tierConfig.limit - timestamps.length),
      resetAt: timestamps.length > 0 ? timestamps[0] + tierConfig.windowMs : now + tierConfig.windowMs,
    };
  }

  /**
   * Reset rate limit for a specific account
   *
   * @param {string} tier - Account tier
   * @param {string} accountId - Account identifier
   */
  reset(tier, accountId = 'default') {
    const key = this.getKey(tier, accountId);
    this.requestTracker.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll() {
    this.requestTracker.clear();
  }

  /**
   * Get tier configuration
   *
   * @private
   * @param {string} tier - Tier name
   * @returns {TierConfig} Tier configuration
   */
  getTierConfig(tier) {
    const config = this.tiers[tier];
    if (!config) {
      // Default to free tier if unknown
      return this.tiers.free || DEFAULT_TIERS.free;
    }
    return config;
  }

  /**
   * Generate tracking key for tier + account
   *
   * @private
   * @param {string} tier - Tier name
   * @param {string} accountId - Account identifier
   * @returns {string} Tracking key
   */
  getKey(tier, accountId) {
    return `${tier}:${accountId}`;
  }

  /**
   * Start periodic cleanup of old entries
   *
   * @private
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Don't keep process alive just for cleanup
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up old timestamps from all tracked accounts
   *
   * @private
   */
  cleanup() {
    const now = Date.now();

    for (const [key, timestamps] of this.requestTracker.entries()) {
      // Extract tier from key to get window size
      const tier = key.split(':')[0];
      const tierConfig = this.getTierConfig(tier);
      const windowStart = now - tierConfig.windowMs;

      // Filter out old timestamps
      const filtered = timestamps.filter(ts => ts > windowStart);

      if (filtered.length === 0) {
        // No active timestamps, remove entry
        this.requestTracker.delete(key);
      } else if (filtered.length < timestamps.length) {
        // Some timestamps removed, update entry
        this.requestTracker.set(key, filtered);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics about current rate limiter state
   *
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      totalAccounts: this.requestTracker.size,
      byTier: {},
    };

    for (const [key, timestamps] of this.requestTracker.entries()) {
      const [tier] = key.split(':');
      if (!stats.byTier[tier]) {
        stats.byTier[tier] = {
          accounts: 0,
          totalRequests: 0,
        };
      }
      stats.byTier[tier].accounts++;
      stats.byTier[tier].totalRequests += timestamps.length;
    }

    return stats;
  }
}

/**
 * Create a singleton rate limiter instance
 *
 * @param {Object} options - Configuration options
 * @returns {RateLimiter} Rate limiter instance
 */
export function createRateLimiter(options = {}) {
  return new RateLimiter(options);
}

// Export default tiers for reference
export { DEFAULT_TIERS };
