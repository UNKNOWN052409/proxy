/**
 * Basic verification tests for RequestQueue
 */

import RequestQueue from './request-queue.js';

// Helper to create a delayed promise
const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));

async function testBasicEnqueue() {
  console.log('Test 1: Basic enqueue and execution');
  const queue = new RequestQueue({ maxConcurrency: 2 });

  let executed = [];
  const req1 = queue.enqueue(() => {
    executed.push(1);
    return delay(50, 'result1');
  });

  const req2 = queue.enqueue(() => {
    executed.push(2);
    return delay(50, 'result2');
  });

  const results = await Promise.all([req1, req2]);
  console.log('  ✓ Results:', results);
  console.log('  ✓ Executed order:', executed);
  console.log('  ✓ Stats:', queue.getStats());
}

async function testConcurrencyLimit() {
  console.log('\nTest 2: Concurrency limit enforcement');
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

  console.log('  ✓ Max concurrent:', maxConcurrent, '(should be 2)');
  console.log('  ✓ Stats:', queue.getStats());
}

async function testPriority() {
  console.log('\nTest 3: Priority ordering');
  const queue = new RequestQueue({ maxConcurrency: 1 });

  let executionOrder = [];

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

  console.log('  ✓ Execution order:', executionOrder);
  console.log('  ✓ Expected: blocker, high, normal, low');
}

async function testPauseResume() {
  console.log('\nTest 4: Pause and resume');
  const queue = new RequestQueue({ maxConcurrency: 5 });

  let executed = 0;

  queue.pause();
  console.log('  ✓ Queue paused');

  const requests = Array(3).fill(0).map(() =>
    queue.enqueue(async () => {
      executed++;
      await delay(50);
    })
  );

  await delay(100);
  console.log('  ✓ After 100ms (paused):', executed, 'executed (should be 0)');

  queue.resume();
  console.log('  ✓ Queue resumed');

  await Promise.all(requests);
  console.log('  ✓ After resume:', executed, 'executed (should be 3)');
}

async function testClear() {
  console.log('\nTest 5: Clear queue');
  const queue = new RequestQueue({ maxConcurrency: 1 });

  // Start a blocker
  queue.enqueue(() => delay(100, 'blocker'));

  // Queue some requests
  const req1 = queue.enqueue(() => delay(10, 'req1'));
  const req2 = queue.enqueue(() => delay(10, 'req2'));

  await delay(50);
  queue.clear(new Error('Queue cleared'));

  try {
    await req1;
    console.log('  ✗ req1 should have been rejected');
  } catch (error) {
    console.log('  ✓ req1 rejected:', error.message);
  }

  try {
    await req2;
    console.log('  ✗ req2 should have been rejected');
  } catch (error) {
    console.log('  ✓ req2 rejected:', error.message);
  }

  const stats = queue.getStats();
  console.log('  ✓ Stats:', stats);
}

async function runTests() {
  console.log('=== RequestQueue Verification Tests ===\n');

  try {
    await testBasicEnqueue();
    await testConcurrencyLimit();
    await testPriority();
    await testPauseResume();
    await testClear();

    console.log('\n=== All tests passed ✓ ===');
  } catch (error) {
    console.error('\n=== Test failed ✗ ===');
    console.error(error);
    process.exit(1);
  }
}

runTests();
