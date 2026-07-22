/**
 * Priority-based request queue with configurable concurrency limit
 * Manages concurrent request execution with overflow handling
 */

const PRIORITY = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2
};

class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 50;
    this.paused = false;

    // Track active requests
    this.activeRequests = new Map();
    this.nextRequestId = 0;

    // Priority queues: [high, normal, low]
    this.queues = [[], [], []];

    // Statistics
    this.stats = {
      queued: 0,
      active: 0,
      completed: 0,
      failed: 0,
      rejected: 0
    };
  }

  /**
   * Enqueue a request for execution
   * @param {Function} fn - Async function to execute
   * @param {string} priority - 'high', 'normal', or 'low' (default: 'normal')
   * @returns {Promise} - Resolves when request completes
   */
  enqueue(fn, priority = 'normal') {
    if (typeof fn !== 'function') {
      return Promise.reject(new Error('Request must be a function'));
    }

    const priorityLevel = this._getPriorityLevel(priority);
    const requestId = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      const request = {
        id: requestId,
        fn,
        priority: priorityLevel,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      this.queues[priorityLevel].push(request);
      this.stats.queued++;

      // Try to process immediately if slots available
      this._processNext();
    });
  }

  /**
   * Process next request from queue if capacity available
   * @private
   */
  _processNext() {
    if (this.paused) {
      return;
    }

    // Check if we have capacity
    if (this.activeRequests.size >= this.maxConcurrency) {
      return;
    }

    // Find next request from priority queues (high -> normal -> low)
    const request = this._dequeueNext();
    if (!request) {
      return;
    }

    // Execute request
    this._executeRequest(request);
  }

  /**
   * Dequeue next request based on priority
   * @private
   * @returns {Object|null} - Next request or null if queues empty
   */
  _dequeueNext() {
    // Process high priority first, then normal, then low
    for (let i = 0; i < this.queues.length; i++) {
      if (this.queues[i].length > 0) {
        this.stats.queued--;
        return this.queues[i].shift(); // FIFO within priority
      }
    }
    return null;
  }

  /**
   * Execute a request
   * @private
   * @param {Object} request - Request object
   */
  async _executeRequest(request) {
    this.activeRequests.set(request.id, request);
    this.stats.active++;
    request.startedAt = Date.now();

    try {
      const result = await request.fn();

      // Request completed successfully
      this.stats.completed++;
      request.resolve(result);
    } catch (error) {
      // Request failed
      this.stats.failed++;
      request.reject(error);
    } finally {
      // Clean up and process next
      this.activeRequests.delete(request.id);
      this.stats.active--;

      // Process next queued request
      this._processNext();
    }
  }

  /**
   * Get priority level from string
   * @private
   * @param {string} priority - Priority string
   * @returns {number} - Priority level (0=high, 1=normal, 2=low)
   */
  _getPriorityLevel(priority) {
    const normalized = priority.toLowerCase();
    if (normalized === 'high') return PRIORITY.HIGH;
    if (normalized === 'low') return PRIORITY.LOW;
    return PRIORITY.NORMAL;
  }

  /**
   * Get current queue statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      queuedByPriority: {
        high: this.queues[PRIORITY.HIGH].length,
        normal: this.queues[PRIORITY.NORMAL].length,
        low: this.queues[PRIORITY.LOW].length
      },
      maxConcurrency: this.maxConcurrency,
      paused: this.paused
    };
  }

  /**
   * Clear all pending requests
   * @param {Error} reason - Optional error to reject pending requests with
   */
  clear(reason) {
    const error = reason || new Error('Queue cleared');

    // Reject all queued requests
    for (const queue of this.queues) {
      while (queue.length > 0) {
        const request = queue.shift();
        this.stats.queued--;
        this.stats.rejected++;
        request.reject(error);
      }
    }
  }

  /**
   * Pause queue processing
   * Active requests continue, but no new requests are started
   */
  pause() {
    this.paused = true;
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.paused = false;

    // Process any queued requests
    while (this.activeRequests.size < this.maxConcurrency) {
      const request = this._dequeueNext();
      if (!request) break;
      this._executeRequest(request);
    }
  }

  /**
   * Wait for all active requests to complete
   * @returns {Promise} - Resolves when all active requests complete
   */
  async drain() {
    if (this.activeRequests.size === 0) {
      return;
    }

    const activePromises = Array.from(this.activeRequests.values()).map(request => {
      return new Promise(resolve => {
        const originalResolve = request.resolve;
        const originalReject = request.reject;

        request.resolve = (value) => {
          originalResolve(value);
          resolve();
        };

        request.reject = (error) => {
          originalReject(error);
          resolve();
        };
      });
    });

    await Promise.all(activePromises);
  }
}

export default RequestQueue;
export { PRIORITY };
