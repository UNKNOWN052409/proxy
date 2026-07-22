// tests/rate-limiter.test.js
// Integration tests for rate limiter system

import test from 'node:test';
import assert from 'node:assert';
import { RateLimiter, createRateLimiter, DEFAULT_TIERS } from '../src/lib/queue/rate-limiter.js';

// Helper to wait
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Rate Limiter - Tier Configuration', () => {
  test('should use default tier configurations', () => {
    const limiter = new RateLimiter();

    assert.ok(limiter.tiers.free);
    assert.ok(limiter.tiers.pro);
    assert.ok(limiter.tiers.enterprise);

    assert.strictEqual(limiter.tiers.free.limit, 10);
    assert.strictEqual(limiter.tiers.pro.limit, 100);
    assert.strictEqual(limiter.tiers.enterprise.limit, 1000);
  });

  test('should accept custom tier configurations', () => {
    const customTiers = {
      basic: { limit: 5, windowMs: 30000 },
      premium: { limit: 100, windowMs: 60000 },
    };

    const limiter = new RateLimiter({ tiers: customTiers });

    assert.deepStrictEqual(limiter.tiers, customTiers);
  });

  test('should default to free tier for unknown tiers', () => {
    const limiter = new RateLimiter();
    const result = limiter.checkLimit('unknown-tier', 'account1');

    assert.ok(result.allowed);
    assert.strictEqual(result.limit, 10); // free tier limit
  });
});

test.describe('Rate Limiter - Basic Limit Checking', () => {
  test('should allow requests within limit', () => {
    const limiter = new RateLimiter();

    for (let i = 0; i < 5; i++) {
      const result = limiter.checkLimit('free', 'account1');
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.limit, 10);
    }

    const stats = limiter.getUsage('free', 'account1');
    assert.strictEqual(stats.count, 5);
    assert.strictEqual(stats.remaining, 5);
  });

  test('should block requests exceeding limit', () => {
    const limiter = new RateLimiter();

    // Use up all 10 requests for free tier
    for (let i = 0; i < 10; i++) {
      const result = limiter.checkLimit('free', 'account1');
      assert.strictEqual(result.allowed, true);
    }

    // 11th request should be blocked
    const result = limiter.checkLimit('free', 'account1');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
  });

  test('should allow many requests for enterprise tier', () => {
    const limiter = new RateLimiter();

    // Try 100 requests (enterprise limit is 1000)
    for (let i = 0; i < 100; i++) {
      const result = limiter.checkLimit('enterprise', 'account1');
      assert.strictEqual(result.allowed, true);
      assert.ok(result.remaining >= 0);
      assert.strictEqual(result.limit, 1000);
    }
  });

  test('should provide remaining count', () => {
    const limiter = new RateLimiter();

    const result1 = limiter.checkLimit('free', 'account1');
    assert.strictEqual(result1.remaining, 9); // 10 - 1

    const result2 = limiter.checkLimit('free', 'account1');
    assert.strictEqual(result2.remaining, 8); // 10 - 2

    limiter.checkLimit('free', 'account1');
    const result3 = limiter.checkLimit('free', 'account1');
    assert.strictEqual(result3.remaining, 6); // 10 - 4
  });

  test('should provide reset timestamp', () => {
    const limiter = new RateLimiter();
    const before = Date.now();

    const result = limiter.checkLimit('free', 'account1');

    const after = Date.now();
    const expectedMin = before + 60000; // window is 1 minute
    const expectedMax = after + 60000;

    assert.ok(result.resetAt >= expectedMin);
    assert.ok(result.resetAt <= expectedMax);
  });
});

test.describe('Rate Limiter - Sliding Window', () => {
  test('should allow requests after window expires', async () => {
    const customTiers = {
      test: { limit: 2, windowMs: 100 }, // 100ms window
    };
    const limiter = new RateLimiter({ tiers: customTiers });

    // Use both requests
    limiter.checkLimit('test', 'account1');
    limiter.checkLimit('test', 'account1');

    // Third request should be blocked
    let result = limiter.checkLimit('test', 'account1');
    assert.strictEqual(result.allowed, false);

    // Wait for window to expire
    await delay(150);

    // Should be allowed again
    result = limiter.checkLimit('test', 'account1');
    assert.strictEqual(result.allowed, true);
  });

  test('should remove expired timestamps', async () => {
    const customTiers = {
      test: { limit: 3, windowMs: 100 },
    };
    const limiter = new RateLimiter({ tiers: customTiers });

    // Make 2 requests
    limiter.checkLimit('test', 'account1');
    limiter.checkLimit('test', 'account1');

    // Wait for first 2 to expire
    await delay(150);

    // Make 2 more requests (should be allowed)
    let result1 = limiter.checkLimit('test', 'account1');
    let result2 = limiter.checkLimit('test', 'account1');

    assert.strictEqual(result1.allowed, true);
    assert.strictEqual(result2.allowed, true);

    // Check usage - should only count recent requests
    const usage = limiter.getUsage('test', 'account1');
    assert.strictEqual(usage.count, 2);
  });

  test('should handle requests at window boundary', async () => {
    const customTiers = {
      test: { limit: 2, windowMs: 100 },
    };
    const limiter = new RateLimiter({ tiers: customTiers });

    limiter.checkLimit('test', 'account1');
    await delay(60);
    limiter.checkLimit('test', 'account1');

    // Both still in window, next should be blocked
    let result = limiter.checkLimit('test', 'account1');
    assert.strictEqual(result.allowed, false);

    // Wait for first to expire
    await delay(50);

    // Should be allowed again
    result = limiter.checkLimit('test', 'account1');
    assert.strictEqual(result.allowed, true);
  });
});

test.describe('Rate Limiter - Multiple Accounts', () => {
  test('should track limits per account independently', () => {
    const limiter = new RateLimiter();

    // Use up account1's limit
    for (let i = 0; i < 10; i++) {
      limiter.checkLimit('free', 'account1');
    }

    // account1 should be blocked
    let result1 = limiter.checkLimit('free', 'account1');
    assert.strictEqual(result1.allowed, false);

    // account2 should still be allowed
    let result2 = limiter.checkLimit('free', 'account2');
    assert.strictEqual(result2.allowed, true);
  });

  test('should track different tiers independently', () => {
    const limiter = new RateLimiter();

    // Use free tier limit
    for (let i = 0; i < 10; i++) {
      limiter.checkLimit('free', 'account1');
    }

    let freeResult = limiter.checkLimit('free', 'account1');
    assert.strictEqual(freeResult.allowed, false);

    // Same account on pro tier should be allowed
    let proResult = limiter.checkLimit('pro', 'account1');
    assert.strictEqual(proResult.allowed, true);
  });

  test('should support default account id', () => {
    const limiter = new RateLimiter();

    // Use default account
    for (let i = 0; i < 5; i++) {
      limiter.checkLimit('free'); // No account ID
    }

    const usage = limiter.getUsage('free'); // No account ID
    assert.strictEqual(usage.count, 5);
  });
});

test.describe('Rate Limiter - Manual Recording', () => {
  test('should record requests without checking limit', () => {
    const limiter = new RateLimiter();

    limiter.recordRequest('free', 'account1');
    limiter.recordRequest('free', 'account1');

    const usage = limiter.getUsage('free', 'account1');
    assert.strictEqual(usage.count, 2);
  });

  test('should allow recording beyond limit', () => {
    const limiter = new RateLimiter();

    // Record 15 requests (exceeds free limit of 10)
    for (let i = 0; i < 15; i++) {
      limiter.recordRequest('free', 'account1');
    }

    const usage = limiter.getUsage('free', 'account1');
    assert.strictEqual(usage.count, 15);
    assert.strictEqual(usage.remaining, 0); // Clamped at 0 (Math.max prevents negative)
  });
});

test.describe('Rate Limiter - Reset Operations', () => {
  test('should reset specific account', () => {
    const limiter = new RateLimiter();

    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('free', 'account2');

    limiter.reset('free', 'account1');

    const usage1 = limiter.getUsage('free', 'account1');
    const usage2 = limiter.getUsage('free', 'account2');

    assert.strictEqual(usage1.count, 0);
    assert.strictEqual(usage2.count, 1);
  });

  test('should reset all accounts', () => {
    const limiter = new RateLimiter();

    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('pro', 'account2');

    limiter.resetAll();

    const usage1 = limiter.getUsage('free', 'account1');
    const usage2 = limiter.getUsage('pro', 'account2');

    assert.strictEqual(usage1.count, 0);
    assert.strictEqual(usage2.count, 0);
  });
});

test.describe('Rate Limiter - Statistics', () => {
  test('should provide overall statistics', () => {
    const limiter = new RateLimiter();

    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('free', 'account2');
    limiter.checkLimit('pro', 'account3');

    const stats = limiter.getStats();

    assert.strictEqual(stats.totalAccounts, 3);
    assert.strictEqual(stats.byTier.free.accounts, 2);
    assert.strictEqual(stats.byTier.pro.accounts, 1);
    assert.strictEqual(stats.byTier.free.totalRequests, 2);
    assert.strictEqual(stats.byTier.pro.totalRequests, 1);
  });

  test('should provide usage information', () => {
    const limiter = new RateLimiter();

    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('free', 'account1');
    limiter.checkLimit('free', 'account1');

    const usage = limiter.getUsage('free', 'account1');

    assert.strictEqual(usage.count, 3);
    assert.strictEqual(usage.limit, 10);
    assert.strictEqual(usage.remaining, 7);
    assert.ok(usage.resetAt > Date.now());
  });
});

test.describe('Rate Limiter - Cleanup', () => {
  test('should clean up old entries', async () => {
    const customTiers = {
      test: { limit: 10, windowMs: 100 },
    };
    const limiter = new RateLimiter({ tiers: customTiers });

    limiter.checkLimit('test', 'account1');
    limiter.checkLimit('test', 'account2');

    // Wait for entries to expire
    await delay(150);

    // Manually trigger cleanup
    limiter.cleanup();

    const stats = limiter.getStats();
    assert.strictEqual(stats.totalAccounts, 0);
  });

  test('should keep active entries during cleanup', async () => {
    const customTiers = {
      test: { limit: 10, windowMs: 200 },
    };
    const limiter = new RateLimiter({ tiers: customTiers });

    limiter.checkLimit('test', 'account1');
    await delay(50);
    limiter.checkLimit('test', 'account2');

    await delay(160); // account1 expired (210ms old), account2 still active (160ms old)

    limiter.cleanup();

    const stats = limiter.getStats();
    assert.strictEqual(stats.totalAccounts, 1);
    assert.strictEqual(stats.byTier.test.accounts, 1);
  });

  test('should destroy cleanup interval', () => {
    const limiter = new RateLimiter();

    assert.ok(limiter.cleanupInterval);

    limiter.destroy();

    assert.strictEqual(limiter.cleanupInterval, null);
  });
});

test.describe('Rate Limiter - Factory Function', () => {
  test('should create limiter with factory', () => {
    const limiter = createRateLimiter();

    assert.ok(limiter instanceof RateLimiter);
    assert.ok(limiter.tiers);
  });

  test('should pass options to factory', () => {
    const customTiers = {
      custom: { limit: 99, windowMs: 999 },
    };

    const limiter = createRateLimiter({ tiers: customTiers });

    assert.deepStrictEqual(limiter.tiers, customTiers);
  });
});
