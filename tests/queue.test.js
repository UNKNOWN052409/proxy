// tests/queue.test.js
// Integration tests for request queue system

import test from 'node:test';
import assert from 'node:assert';
import RequestQueue, { PRIORITY } from '../src/lib/queue/request-queue.js';

// Helper to create delayed promises
const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));

test.describe('Request Queue - Basic Operations', () => {
  test('should enqueue and execute requests', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });
    const executed = [];

    const req1 = queue.enqueue(async () => {
      executed.push(1);
      return delay(50, 'result1');
    });

    const req2 = queue.enqueue(async () => {
      executed.push(2);
      return delay(50, 'result2');
    });

    const results = await Promise.all([req1, req2]);

    assert.deepStrictEqual(results, ['result1', 'result2']);
    assert.deepStrictEqual(executed, [1, 2]);
  });

  test('should reject non-function requests', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    await assert.rejects(
      () => queue.enqueue('not a function'),
      { message: /must be a function/ }
    );
  });

  test('should track request statistics', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    const req1 = queue.enqueue(() => delay(50, 'r1'));
    const req2 = queue.enqueue(() => delay(50, 'r2'));

    await Promise.all([req1, req2]);

    const stats = queue.getStats();
    assert.strictEqual(stats.completed, 2);
    assert.strictEqual(stats.active, 0);
    assert.strictEqual(stats.queued, 0);
  });
});

test.describe('Request Queue - Concurrency Control', () => {
  test('should enforce concurrency limit', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    let concurrent = 0;
    let maxConcurrent = 0;

    const makeRequest = () => queue.enqueue(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await delay(100);
      concurrent--;
    });

    const requests = Array(5).fill(0).map(() => makeRequest());
    await Promise.all(requests);

    assert.strictEqual(maxConcurrent, 2, 'Should not exceed maxConcurrency of 2');
  });

  test('should process queued requests after active ones complete', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });
    const executionOrder = [];

    // Fill the slot
    const req1 = queue.enqueue(async () => {
      executionOrder.push('first');
      await delay(100);
    });

    // Queue more requests
    const req2 = queue.enqueue(async () => {
      executionOrder.push('second');
      await delay(50);
    });

    const req3 = queue.enqueue(async () => {
      executionOrder.push('third');
      await delay(50);
    });

    await Promise.all([req1, req2, req3]);

    assert.deepStrictEqual(executionOrder, ['first', 'second', 'third']);
  });

  test('should update stats correctly during execution', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    queue.enqueue(() => delay(100, 'r1'));
    queue.enqueue(() => delay(100, 'r2'));
    queue.enqueue(() => delay(100, 'r3'));

    await delay(10); // Let first 2 start

    const stats = queue.getStats();
    assert.strictEqual(stats.active, 2);
    assert.strictEqual(stats.queued, 1);
  });
});

test.describe('Request Queue - Priority Handling', () => {
  test('should execute high priority requests first', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });
    const executionOrder = [];

    // Start with a slow request to fill the slot
    queue.enqueue(async () => {
      executionOrder.push('blocker');
      await delay(100);
    });

    // Queue requests with different priorities
    const low = queue.enqueue(() => {
      executionOrder.push('low');
      return delay(10);
    }, 'low');

    const high = queue.enqueue(() => {
      executionOrder.push('high');
      return delay(10);
    }, 'high');

    const normal = queue.enqueue(() => {
      executionOrder.push('normal');
      return delay(10);
    }, 'normal');

    await Promise.all([low, high, normal]);

    // High should execute before normal and low
    assert.deepStrictEqual(executionOrder, ['blocker', 'high', 'normal', 'low']);
  });

  test('should maintain FIFO within same priority', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });
    const executionOrder = [];

    queue.enqueue(() => {
      executionOrder.push('blocker');
      return delay(100);
    });

    // Queue multiple normal priority requests
    const req1 = queue.enqueue(() => {
      executionOrder.push('normal1');
      return delay(10);
    }, 'normal');

    const req2 = queue.enqueue(() => {
      executionOrder.push('normal2');
      return delay(10);
    }, 'normal');

    const req3 = queue.enqueue(() => {
      executionOrder.push('normal3');
      return delay(10);
    }, 'normal');

    await Promise.all([req1, req2, req3]);

    assert.deepStrictEqual(executionOrder, ['blocker', 'normal1', 'normal2', 'normal3']);
  });

  test('should report queued requests by priority', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });

    queue.enqueue(() => delay(100)); // Fill slot

    queue.enqueue(() => delay(10), 'high');
    queue.enqueue(() => delay(10), 'high');
    queue.enqueue(() => delay(10), 'normal');
    queue.enqueue(() => delay(10), 'low');

    await delay(10);

    const stats = queue.getStats();
    assert.strictEqual(stats.queuedByPriority.high, 2);
    assert.strictEqual(stats.queuedByPriority.normal, 1);
    assert.strictEqual(stats.queuedByPriority.low, 1);
  });
});

test.describe('Request Queue - Pause and Resume', () => {
  test('should pause queue processing', async () => {
    const queue = new RequestQueue({ maxConcurrency: 5 });
    let executed = 0;

    queue.pause();

    const requests = Array(3).fill(0).map(() =>
      queue.enqueue(async () => {
        executed++;
        await delay(50);
      })
    );

    await delay(100); // Wait longer than request duration

    assert.strictEqual(executed, 0, 'No requests should execute while paused');
    assert.ok(queue.getStats().paused);

    queue.resume();
    await Promise.all(requests);

    assert.strictEqual(executed, 3, 'All requests should execute after resume');
  });

  test('should allow active requests to complete when paused', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });
    let completed = 0;

    const req1 = queue.enqueue(async () => {
      await delay(100);
      completed++;
    });

    const req2 = queue.enqueue(async () => {
      await delay(100);
      completed++;
    });

    await delay(50); // Let them start

    queue.pause();

    await Promise.all([req1, req2]);

    assert.strictEqual(completed, 2, 'Active requests should complete');
  });

  test('should process queued requests on resume', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });
    let executed = 0;

    queue.pause();

    const requests = Array(5).fill(0).map(() =>
      queue.enqueue(async () => {
        executed++;
        await delay(50);
      })
    );

    assert.strictEqual(executed, 0);

    queue.resume();

    await Promise.all(requests);

    assert.strictEqual(executed, 5);
  });
});

test.describe('Request Queue - Clear Operations', () => {
  test('should clear pending requests', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });

    // Start a blocker
    queue.enqueue(() => delay(100, 'blocker'));

    // Queue requests
    const req1 = queue.enqueue(() => delay(10, 'req1'));
    const req2 = queue.enqueue(() => delay(10, 'req2'));

    await delay(50);
    queue.clear(new Error('Queue cleared'));

    await assert.rejects(() => req1, { message: 'Queue cleared' });
    await assert.rejects(() => req2, { message: 'Queue cleared' });

    const stats = queue.getStats();
    assert.strictEqual(stats.rejected, 2);
    assert.strictEqual(stats.queued, 0);
  });

  test('should use default error message when clearing', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });

    queue.enqueue(() => delay(100));
    const req = queue.enqueue(() => delay(10));

    await delay(50);
    queue.clear();

    await assert.rejects(() => req, { message: 'Queue cleared' });
  });
});

test.describe('Request Queue - Error Handling', () => {
  test('should handle request failures', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    const successReq = queue.enqueue(() => delay(50, 'success'));
    const failReq = queue.enqueue(async () => {
      await delay(50);
      throw new Error('Request failed');
    });

    const success = await successReq;
    assert.strictEqual(success, 'success');

    await assert.rejects(() => failReq, { message: 'Request failed' });

    const stats = queue.getStats();
    assert.strictEqual(stats.completed, 1);
    assert.strictEqual(stats.failed, 1);
  });

  test('should continue processing after request failure', async () => {
    const queue = new RequestQueue({ maxConcurrency: 1 });
    const results = [];

    const req1 = queue.enqueue(() => delay(50, 'r1'));
    const req2 = queue.enqueue(async () => {
      await delay(50);
      throw new Error('Failed');
    });
    const req3 = queue.enqueue(() => delay(50, 'r3'));

    results.push(await req1);
    await assert.rejects(() => req2);
    results.push(await req3);

    assert.deepStrictEqual(results, ['r1', 'r3']);
  });
});

test.describe('Request Queue - Drain', () => {
  test('should wait for all active requests to complete', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });
    let completed = 0;

    queue.enqueue(async () => {
      await delay(100);
      completed++;
    });

    queue.enqueue(async () => {
      await delay(150);
      completed++;
    });

    await delay(50); // Let them start

    await queue.drain();

    assert.strictEqual(completed, 2);
  });

  test('should resolve immediately if no active requests', async () => {
    const queue = new RequestQueue({ maxConcurrency: 2 });

    const start = Date.now();
    await queue.drain();
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, 'Should resolve immediately');
  });
});
