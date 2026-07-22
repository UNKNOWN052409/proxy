// tests/retry.test.js
// Integration tests for exponential backoff retry logic

import test from 'node:test';
import assert from 'node:assert';
import {
  calculateDelay,
  addJitter,
  sleep,
  isRetryable,
  retry,
  createRetry,
  retryWithStrategy,
  DEFAULT_RETRY_OPTIONS,
} from '../src/lib/queue/retry.js';

test.describe('Retry Logic - Delay Calculation', () => {
  test('should calculate exponential backoff correctly', () => {
    const baseDelay = 1000;
    const multiplier = 2;

    assert.strictEqual(calculateDelay(0, baseDelay, multiplier), 1000);
    assert.strictEqual(calculateDelay(1, baseDelay, multiplier), 2000);
    assert.strictEqual(calculateDelay(2, baseDelay, multiplier), 4000);
    assert.strictEqual(calculateDelay(3, baseDelay, multiplier), 8000);
  });

  test('should respect max delay cap', () => {
    const baseDelay = 1000;
    const multiplier = 2;
    const maxDelay = 5000;

    assert.strictEqual(calculateDelay(0, baseDelay, multiplier, maxDelay), 1000);
    assert.strictEqual(calculateDelay(1, baseDelay, multiplier, maxDelay), 2000);
    assert.strictEqual(calculateDelay(2, baseDelay, multiplier, maxDelay), 4000);
    assert.strictEqual(calculateDelay(3, baseDelay, multiplier, maxDelay), 5000); // Capped
    assert.strictEqual(calculateDelay(10, baseDelay, multiplier, maxDelay), 5000); // Still capped
  });

  test('should handle different multipliers', () => {
    const baseDelay = 100;
    const maxDelay = 10000;

    // Multiplier 3
    assert.strictEqual(calculateDelay(0, baseDelay, 3, maxDelay), 100);
    assert.strictEqual(calculateDelay(1, baseDelay, 3, maxDelay), 300);
    assert.strictEqual(calculateDelay(2, baseDelay, 3, maxDelay), 900);

    // Multiplier 1.5
    assert.strictEqual(calculateDelay(0, baseDelay, 1.5, maxDelay), 100);
    assert.strictEqual(calculateDelay(1, baseDelay, 1.5, maxDelay), 150);
  });
});

test.describe('Retry Logic - Jitter', () => {
  test('should add jitter within expected range', () => {
    const delay = 1000;
    const jitterFactor = 0.3; // ±30%

    for (let i = 0; i < 100; i++) {
      const jittered = addJitter(delay, jitterFactor);

      // Should be within ±30% of original delay
      assert.ok(jittered >= 700, `Jittered value ${jittered} too low`);
      assert.ok(jittered <= 1300, `Jittered value ${jittered} too high`);
    }
  });

  test('should never return negative delay', () => {
    const delay = 10;
    const jitterFactor = 2; // Extreme jitter

    for (let i = 0; i < 100; i++) {
      const jittered = addJitter(delay, jitterFactor);
      assert.ok(jittered >= 0);
    }
  });

  test('should handle zero jitter factor', () => {
    const delay = 1000;
    const jittered = addJitter(delay, 0);

    assert.strictEqual(jittered, delay);
  });
});

test.describe('Retry Logic - Sleep', () => {
  test('should sleep for specified duration', async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;

    assert.ok(elapsed >= 95); // Allow 5ms tolerance
    assert.ok(elapsed < 150); // Should not take much longer
  });

  test('should resolve immediately for zero duration', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50);
  });
});

test.describe('Retry Logic - Error Classification', () => {
  test('should identify network errors as retryable', () => {
    const errors = [
      { code: 'ECONNRESET' },
      { code: 'ETIMEDOUT' },
      { code: 'ENOTFOUND' },
      { code: 'ECONNREFUSED' },
    ];

    errors.forEach(error => {
      assert.strictEqual(isRetryable(error), true, `${error.code} should be retryable`);
    });
  });

  test('should identify 5xx errors as retryable', () => {
    for (let status = 500; status < 600; status++) {
      const error = { status };
      assert.strictEqual(isRetryable(error), true, `${status} should be retryable`);
    }
  });

  test('should identify 429 as retryable', () => {
    assert.strictEqual(isRetryable({ status: 429 }), true);
    assert.strictEqual(isRetryable({ statusCode: 429 }), true);
  });

  test('should identify 408 as retryable', () => {
    assert.strictEqual(isRetryable({ status: 408 }), true);
  });

  test('should identify 4xx client errors as not retryable', () => {
    const nonRetryable = [400, 401, 403, 404];

    nonRetryable.forEach(status => {
      const error = { status };
      assert.strictEqual(isRetryable(error), false, `${status} should not be retryable`);
    });
  });

  test('should identify rate limit messages as retryable', () => {
    const error = { message: 'Rate limit exceeded' };
    assert.strictEqual(isRetryable(error), true);
  });

  test('should identify timeout messages as retryable', () => {
    const errors = [
      { message: 'Request timeout' },
      { message: 'Operation timed out' },
    ];

    errors.forEach(error => {
      assert.strictEqual(isRetryable(error), true);
    });
  });

  test('should default to retryable for unknown errors', () => {
    const error = { message: 'Unknown error' };
    assert.strictEqual(isRetryable(error), true);
  });
});

test.describe('Retry Logic - Basic Retry', () => {
  test('should succeed on first try', async () => {
    let attempts = 0;

    const result = await retry(async () => {
      attempts++;
      return 'success';
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 1);
  });

  test('should retry on failure and succeed', async () => {
    let attempts = 0;

    const result = await retry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    }, { baseDelay: 10, maxRetries: 5 });

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  test('should throw after max retries', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await retry(async () => {
          attempts++;
          throw new Error('Permanent failure');
        }, { maxRetries: 2, baseDelay: 10 });
      },
      { message: 'Permanent failure' }
    );

    assert.strictEqual(attempts, 3); // Initial + 2 retries
  });

  test('should not retry non-retryable errors', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await retry(async () => {
          attempts++;
          const error = new Error('Client error');
          error.status = 404;
          throw error;
        }, { maxRetries: 3, baseDelay: 10 });
      },
      { message: 'Client error' }
    );

    assert.strictEqual(attempts, 1); // Should not retry
  });

  test('should use custom shouldRetry function', async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Custom error');
          error.code = 'CUSTOM';
          throw error;
        }
        return 'success';
      },
      {
        maxRetries: 3,
        baseDelay: 10,
        shouldRetry: (error) => error.code === 'CUSTOM',
      }
    );

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 2);
  });

  test('should call onRetry callback', async () => {
    let attempts = 0;
    const retryLog = [];

    await retry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry me');
        }
        return 'success';
      },
      {
        maxRetries: 5,
        baseDelay: 10,
        jitterFactor: 0,
        onRetry: (error, attempt, delay) => {
          retryLog.push({ attempt, delay, message: error.message });
        },
      }
    );

    assert.strictEqual(retryLog.length, 2);
    assert.strictEqual(retryLog[0].attempt, 0);
    assert.strictEqual(retryLog[0].delay, 10);
    assert.strictEqual(retryLog[1].attempt, 1);
    assert.strictEqual(retryLog[1].delay, 20);
  });
});

test.describe('Retry Logic - Default Options', () => {
  test('should use default configuration', () => {
    assert.strictEqual(DEFAULT_RETRY_OPTIONS.maxRetries, 3);
    assert.strictEqual(DEFAULT_RETRY_OPTIONS.baseDelay, 1000);
    assert.strictEqual(DEFAULT_RETRY_OPTIONS.maxDelay, 30000);
    assert.strictEqual(DEFAULT_RETRY_OPTIONS.backoffMultiplier, 2);
    assert.strictEqual(DEFAULT_RETRY_OPTIONS.jitterFactor, 0.3);
  });

  test('should merge custom options with defaults', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await retry(
          async () => {
            attempts++;
            throw new Error('Fail');
          },
          { maxRetries: 1, baseDelay: 10 }
        );
      },
      { message: 'Fail' }
    );

    assert.strictEqual(attempts, 2); // Initial + 1 retry
  });
});

test.describe('Retry Logic - Factory Function', () => {
  test('should create retry function with preset options', async () => {
    const customRetry = createRetry({
      maxRetries: 2,
      baseDelay: 10,
    });

    let attempts = 0;

    await assert.rejects(
      async () => {
        await customRetry(async () => {
          attempts++;
          throw new Error('Fail');
        });
      },
      { message: 'Fail' }
    );

    assert.strictEqual(attempts, 3);
  });

  test('should allow override options in factory', async () => {
    const customRetry = createRetry({
      maxRetries: 5,
      baseDelay: 10,
    });

    let attempts = 0;

    await assert.rejects(
      async () => {
        await customRetry(
          async () => {
            attempts++;
            throw new Error('Fail');
          },
          { maxRetries: 1 } // Override
        );
      },
      { message: 'Fail' }
    );

    assert.strictEqual(attempts, 2); // Overridden to 1 retry
  });
});

test.describe('Retry Logic - Strategy Variants', () => {
  test('should support exponential strategy', async () => {
    let attempts = 0;

    const result = await retryWithStrategy(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      },
      {
        strategy: 'exponential',
        maxRetries: 5,
        baseDelay: 10,
        jitterFactor: 0,
      }
    );

    assert.strictEqual(result, 'success');
  });

  test('should support linear strategy', async () => {
    let attempts = 0;

    const result = await retryWithStrategy(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      },
      {
        strategy: 'linear',
        maxRetries: 5,
        baseDelay: 10,
      }
    );

    assert.strictEqual(result, 'success');
  });

  test('should support constant strategy', async () => {
    let attempts = 0;

    const result = await retryWithStrategy(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      },
      {
        strategy: 'constant',
        maxRetries: 5,
        baseDelay: 10,
      }
    );

    assert.strictEqual(result, 'success');
  });
});

test.describe('Retry Logic - Timing Verification', () => {
  test('should respect exponential backoff timing', async () => {
    let attempts = 0;
    const start = Date.now();

    await retry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      },
      {
        maxRetries: 3,
        baseDelay: 50,
        jitterFactor: 0,
        backoffMultiplier: 2,
      }
    );

    const elapsed = Date.now() - start;

    // Should take approximately 50ms + 100ms = 150ms
    assert.ok(elapsed >= 140, `Took ${elapsed}ms, expected >= 140ms`);
    assert.ok(elapsed < 250, `Took ${elapsed}ms, expected < 250ms`);
  });
});
