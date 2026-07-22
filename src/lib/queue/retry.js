/**
 * Retry Logic - Exponential backoff with jitter for resilient request handling
 *
 * Implements retry logic with exponential backoff and jitter to handle transient failures
 * gracefully while preventing thundering herd issues.
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @property {number} baseDelay - Initial delay in milliseconds (default: 1000)
 * @property {number} maxDelay - Maximum delay in milliseconds (default: 30000)
 * @property {number} backoffMultiplier - Exponential backoff multiplier (default: 2)
 * @property {number} jitterFactor - Jitter factor 0-1 (default: 0.3)
 * @property {function} shouldRetry - Custom function to determine if error is retryable
 * @property {function} onRetry - Callback called before each retry attempt
 */

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.3,
};

/**
 * Calculate exponential backoff delay
 *
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} backoffMultiplier - Exponential multiplier
 * @param {number} maxDelay - Maximum allowed delay
 * @returns {number} Calculated delay in milliseconds
 */
export function calculateDelay(attempt, baseDelay = 1000, backoffMultiplier = 2, maxDelay = 30000) {
  // Calculate exponential delay: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attempt);

  // Cap at maxDelay
  return Math.min(exponentialDelay, maxDelay);
}

/**
 * Add random jitter to delay to prevent thundering herd
 *
 * @param {number} delay - Base delay in milliseconds
 * @param {number} jitterFactor - Jitter factor (0-1), default 0.3 means +/- 30%
 * @returns {number} Delay with jitter applied
 */
export function addJitter(delay, jitterFactor = 0.3) {
  // Generate random jitter between -jitterFactor and +jitterFactor
  const jitterRange = delay * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // Random between -jitterRange and +jitterRange

  // Apply jitter and ensure non-negative
  return Math.max(0, delay + jitter);
}

/**
 * Sleep for specified milliseconds
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error should be retried
 *
 * @param {Error|Object} error - Error object to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryable(error) {
  // Network errors are retryable
  if (error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED') {
    return true;
  }

  // HTTP status codes
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;

    // 5xx server errors are retryable
    if (status >= 500 && status < 600) {
      return true;
    }

    // 429 Too Many Requests is retryable
    if (status === 429) {
      return true;
    }

    // 408 Request Timeout is retryable
    if (status === 408) {
      return true;
    }

    // 4xx client errors are generally not retryable
    // (except 408 and 429 handled above)
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  // Rate limit errors
  if (error.message && error.message.toLowerCase().includes('rate limit')) {
    return true;
  }

  // Timeout errors
  if (error.message && (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
  )) {
    return true;
  }

  // Default: retry on unknown errors (conservative approach)
  return true;
}

/**
 * Retry a function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {RetryOptions} options - Retry configuration options
 * @returns {Promise<any>} Result of the function call
 * @throws {Error} Last error if all retries fail
 */
export async function retry(fn, options = {}) {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError;
  let attempt = 0;

  while (attempt <= config.maxRetries) {
    try {
      // Attempt the function
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = config.shouldRetry
        ? config.shouldRetry(error, attempt)
        : isRetryable(error);

      // If not retryable or out of retries, throw
      if (!shouldRetry || attempt >= config.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = calculateDelay(
        attempt,
        config.baseDelay,
        config.backoffMultiplier,
        config.maxDelay
      );
      const delayWithJitter = addJitter(baseDelay, config.jitterFactor);

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(error, attempt, delayWithJitter);
      }

      // Wait before retrying
      await sleep(delayWithJitter);

      attempt++;
    }
  }

  // Should never reach here, but throw last error as fallback
  throw lastError;
}

/**
 * Create a retry wrapper with custom configuration
 *
 * @param {RetryOptions} options - Default retry options for this wrapper
 * @returns {Function} Retry function with preset options
 */
export function createRetry(options = {}) {
  const defaultConfig = { ...DEFAULT_RETRY_OPTIONS, ...options };

  return async (fn, overrideOptions = {}) => {
    const config = { ...defaultConfig, ...overrideOptions };
    return retry(fn, config);
  };
}

/**
 * Retry with custom backoff strategy (linear, exponential, constant)
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Options including strategy
 * @returns {Promise<any>} Result of function call
 */
export async function retryWithStrategy(fn, options = {}) {
  const { strategy = 'exponential', ...restOptions } = options;

  let customCalculateDelay;

  switch (strategy) {
    case 'linear':
      customCalculateDelay = (attempt, baseDelay) => {
        return baseDelay * (attempt + 1);
      };
      break;

    case 'constant':
      customCalculateDelay = (attempt, baseDelay) => {
        return baseDelay;
      };
      break;

    case 'exponential':
    default:
      customCalculateDelay = calculateDelay;
      break;
  }

  // Override the delay calculation in retry
  return retry(fn, {
    ...restOptions,
    _customCalculateDelay: customCalculateDelay,
  });
}

// Export default configuration for reference
export { DEFAULT_RETRY_OPTIONS };
