// tests/tier-detector.test.js
// Integration tests for tier detection system

import test from 'node:test';
import assert from 'node:assert';
import { detectTier, batchDetectTiers } from '../src/lib/accounts/tier-detector.js';
import { accountStore } from '../src/lib/accounts/store.js';

// Mock fetch responses
const createMockFetch = (responses) => {
  let callCount = 0;
  return async (url, options) => {
    const response = responses[callCount++] || responses[responses.length - 1];

    return {
      ok: response.ok !== undefined ? response.ok : response.status >= 200 && response.status < 300,
      status: response.status || 200,
      headers: {
        get: (name) => {
          if (name === 'content-type' && response.json) {
            return 'application/json';
          }
          return null;
        },
      },
      json: async () => response.json || {},
    };
  };
};

test.describe('Tier Detection - Account Info Strategy', () => {
  test.beforeEach(() => {
    accountStore.clear();
  });

  test('should detect enterprise tier from account info', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { tier: 'enterprise', email: 'test@example.com' } },
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'enterprise');
  });

  test('should detect pro tier from account info', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { plan: 'pro' } },
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'pro');
  });

  test('should detect free tier from account info', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { subscription: 'free' } },
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'free');
  });

  test('should handle account_type field', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { account_type: 'premium' } },
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'pro');
  });
});

test.describe('Tier Detection - Feature Access Strategy', () => {
  test.beforeEach(() => {
    accountStore.clear();
  });

  test('should detect enterprise via feature access', async () => {
    global.fetch = createMockFetch([
      { status: 404 }, // Account info not available
      { status: 200 }, // Enterprise feature accessible
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'enterprise');
  });

  test('should detect pro via feature access', async () => {
    global.fetch = createMockFetch([
      { status: 404 }, // Account info not available
      { status: 403 }, // Enterprise feature forbidden
      { status: 200 }, // Pro feature accessible
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'pro');
  });

  test('should default to free tier when both features forbidden', async () => {
    global.fetch = createMockFetch([
      { status: 404 }, // Account info not available
      { status: 403 }, // Enterprise feature forbidden
      { status: 403 }, // Pro feature forbidden
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'free');
  });

  test('should handle 204 No Content as success', async () => {
    global.fetch = createMockFetch([
      { status: 404 },
      { status: 204 }, // Enterprise feature returns 204
    ]);

    const tier = await detectTier({
      email: 'test@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'enterprise');
  });
});

test.describe('Tier Detection - Caching', () => {
  test.beforeEach(() => {
    accountStore.clear();
  });

  test('should cache tier detection result', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { tier: 'pro' } },
    ]);

    // Add account to store
    const result = accountStore.add({
      email: 'cache-test@example.com',
      password: 'pass123',
      tier: 'free',
      provider: 'manual',
    });

    // Detect tier (should cache result)
    const tier = await detectTier(result.account);
    assert.strictEqual(tier, 'pro');

    // Check that tier was cached in store
    const stored = accountStore.get(result.account.id);
    assert.strictEqual(stored.tier, 'pro');
    assert.ok(stored.metadata);
    assert.ok(stored.metadata.tierDetectedAt);
  });

  test('should use cached tier if recent', async () => {
    let fetchCallCount = 0;
    global.fetch = async () => {
      fetchCallCount++;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ tier: 'enterprise' }),
      };
    };

    // Add account with recent tier detection
    const result = accountStore.add({
      email: 'cached@example.com',
      password: 'pass123',
      tier: 'pro',
      provider: 'manual',
    });

    accountStore.update(result.account.id, {
      metadata: {
        tierDetectedAt: Date.now() - 1000, // Detected 1 second ago
      },
    });

    // Detect tier (should use cache, not call API)
    const tier = await detectTier(accountStore.get(result.account.id));
    assert.strictEqual(tier, 'pro');
    assert.strictEqual(fetchCallCount, 0);
  });

  test('should refresh tier if cache expired', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { tier: 'enterprise' } },
    ]);

    // Add account with old tier detection
    const result = accountStore.add({
      email: 'expired@example.com',
      password: 'pass123',
      tier: 'free',
      provider: 'manual',
    });

    accountStore.update(result.account.id, {
      metadata: {
        tierDetectedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      },
    });

    // Detect tier (should refresh from API)
    const tier = await detectTier(accountStore.get(result.account.id));
    assert.strictEqual(tier, 'enterprise');
  });

  test('should force refresh when requested', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { tier: 'enterprise' } },
    ]);

    // Add account with recent cache
    const result = accountStore.add({
      email: 'force@example.com',
      password: 'pass123',
      tier: 'free',
      provider: 'manual',
    });

    accountStore.update(result.account.id, {
      metadata: {
        tierDetectedAt: Date.now() - 1000,
      },
    });

    // Force refresh
    const tier = await detectTier(accountStore.get(result.account.id), { forceRefresh: true });
    assert.strictEqual(tier, 'enterprise');
  });
});

test.describe('Tier Detection - Error Handling', () => {
  test('should default to free on network error', async () => {
    global.fetch = async () => {
      throw new Error('Network error');
    };

    const tier = await detectTier({
      email: 'error@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'free');
  });

  test('should default to free on timeout', async () => {
    global.fetch = async () => {
      const error = new Error('Timeout');
      error.name = 'AbortError';
      throw error;
    };

    const tier = await detectTier({
      email: 'timeout@example.com',
      password: 'pass123',
    });

    assert.strictEqual(tier, 'free');
  });

  test('should handle invalid credentials gracefully', async () => {
    global.fetch = createMockFetch([
      { status: 401 }, // Unauthorized
    ]);

    const tier = await detectTier({
      email: 'invalid@example.com',
      password: 'wrongpass',
    });

    assert.strictEqual(tier, 'free');
  });

  test('should require email and password', async () => {
    const tier = await detectTier({});
    assert.strictEqual(tier, 'free');
  });
});

test.describe('Batch Tier Detection', () => {
  test.beforeEach(() => {
    accountStore.clear();
  });

  test('should detect tiers for multiple accounts', async () => {
    global.fetch = createMockFetch([
      { status: 200, json: { tier: 'pro' } },
      { status: 200, json: { tier: 'free' } },
      { status: 200, json: { tier: 'enterprise' } },
    ]);

    const accounts = [
      { email: 'user1@example.com', password: 'pass1' },
      { email: 'user2@example.com', password: 'pass2' },
      { email: 'user3@example.com', password: 'pass3' },
    ];

    const result = await batchDetectTiers(accounts, { delayMs: 0 });
    assert.strictEqual(result.detected, 3);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.results.length, 3);
  });

  test('should handle partial failures in batch', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('API error');
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ tier: 'pro' }),
      };
    };

    const accounts = [
      { email: 'user1@example.com', password: 'pass1' },
      { email: 'user2@example.com', password: 'pass2' },
      { email: 'user3@example.com', password: 'pass3' },
    ];

    const result = await batchDetectTiers(accounts, { delayMs: 0 });
    assert.strictEqual(result.detected, 2);
    assert.strictEqual(result.failed, 1);
  });
});
