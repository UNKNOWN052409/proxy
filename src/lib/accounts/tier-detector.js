// src/lib/accounts/tier-detector.js
// Automatic tier detection for Kiro accounts via API test requests

import { accountStore } from "./store.js";

/**
 * Kiro API configuration
 * These are reasonable assumptions about Kiro API structure
 */
const KIRO_API_CONFIG = {
  baseUrl: (() => {
    const url = process.env.KIRO_API_URL || "https://api.kiro.ai";
    if (!url.startsWith("https://")) {
      throw new Error("KIRO_API_URL must use HTTPS protocol for security");
    }
    return url;
  })(),
  endpoints: {
    // Account info endpoint - should return tier information
    accountInfo: "/v1/account/info",
    // Pro-only endpoint - returns 403 for free users
    proFeature: "/v1/features/advanced-analytics",
    // Enterprise-only endpoint - returns 403 for non-enterprise users
    enterpriseFeature: "/v1/features/custom-models",
  },
  timeout: 10000, // 10 second timeout for tier detection requests
};

/**
 * Tier levels in priority order (lowest to highest)
 */
const TIER_LEVELS = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * Make authenticated API request to Kiro
 *
 * @param {string} endpoint - API endpoint path
 * @param {Object} credentials - Account credentials
 * @param {string} credentials.email - Account email
 * @param {string} credentials.password - Account password
 * @returns {Promise<Object>} Response with { success: boolean, status?: number, data?: any, error?: string }
 */
async function makeKiroRequest(endpoint, credentials) {
  const url = `${KIRO_API_CONFIG.baseUrl}${endpoint}`;

  try {
    // Create basic auth header
    const authHeader = `Basic ${Buffer.from(
      `${credentials.email}:${credentials.password}`
    ).toString("base64")}`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KIRO_API_CONFIG.timeout);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "User-Agent": "Kiro-MITM-Proxy/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response body if available
    let data = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return {
      success: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    // Handle timeout, network errors, etc.
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Detect account tier from API response
 *
 * Strategy 1: Check account info endpoint for explicit tier field
 *
 * @param {Object} credentials - Account credentials
 * @returns {Promise<string|null>} Detected tier or null if not found
 */
async function detectTierFromAccountInfo(credentials, throwOnTransportError = false) {
  const response = await makeKiroRequest(
    KIRO_API_CONFIG.endpoints.accountInfo,
    credentials
  );

  if (!response.success) {
    if (throwOnTransportError && response.error) throw new Error(response.error);
    return null;
  }

  // Check if response data contains tier information
  if (response.data && typeof response.data === "object") {
    // Try various common tier field names
    const tierField =
      response.data.tier ||
      response.data.plan ||
      response.data.subscription ||
      response.data.account_type;

    if (tierField) {
      const tierLower = String(tierField).toLowerCase();
      // Match known tier names
      if (tierLower.includes("enterprise")) return "enterprise";
      if (tierLower.includes("pro") || tierLower.includes("premium")) return "pro";
      if (tierLower.includes("free") || tierLower.includes("basic")) return "free";
    }
  }

  return null;
}

/**
 * Detect account tier by testing feature access
 *
 * Strategy 2: Try accessing tier-specific endpoints
 * - Enterprise endpoint access = enterprise tier
 * - Pro endpoint access = pro tier
 * - Neither = free tier
 *
 * @param {Object} credentials - Account credentials
 * @returns {Promise<string>} Detected tier
 */
async function detectTierFromFeatureAccess(credentials, throwOnTransportError = false) {
  // Test enterprise feature first (highest tier)
  const enterpriseResponse = await makeKiroRequest(
    KIRO_API_CONFIG.endpoints.enterpriseFeature,
    credentials
  );

  if (throwOnTransportError && enterpriseResponse.error) throw new Error(enterpriseResponse.error);

  // Status 200 or 204 = has access
  if (enterpriseResponse.success || enterpriseResponse.status === 204) {
    return "enterprise";
  }

  // Test pro feature
  const proResponse = await makeKiroRequest(
    KIRO_API_CONFIG.endpoints.proFeature,
    credentials
  );

  if (throwOnTransportError && proResponse.error) throw new Error(proResponse.error);

  // Status 200 or 204 = has access
  if (proResponse.success || proResponse.status === 204) {
    return "pro";
  }

  // If both return 403 (Forbidden) or 402 (Payment Required), user is on free tier
  // Any other error (401, 500, timeout) is inconclusive, default to free
  return "free";
}

/**
 * Detect account tier for a Kiro account
 *
 * This function makes lightweight API test requests to determine whether
 * an account is on the free, pro, or enterprise tier. Results are cached
 * in the accountStore to avoid repeated API calls.
 *
 * Detection strategy:
 * 1. Check if tier is already cached in account metadata
 * 2. Try to get tier from account info endpoint
 * 3. Fall back to feature access testing
 * 4. Cache the result and return
 *
 * @param {Object} account - Account object or credentials
 * @param {string} account.id - Account ID (optional, for caching)
 * @param {string} account.email - Account email (required)
 * @param {string} account.password - Account password (required)
 * @param {boolean} [options.forceRefresh=false] - Force tier re-detection even if cached
 * @returns {Promise<string>} Detected tier: "free", "pro", or "enterprise"
 *
 * @example
 * const tier = await detectTier({ email: "user@example.com", password: "pass123" });
 * console.log(tier); // "pro"
 *
 * @example
 * // Force refresh cached tier
 * const tier = await detectTier(account, { forceRefresh: true });
 */
export async function detectTier(account, options = {}) {
  const { forceRefresh = false, throwOnTransportError = false } = options;

  // Returned account summaries intentionally omit plaintext credentials. When an
  // ID is present, use the stored credential representation for internal probes.
  if (account && account.id && !account.password) {
    const storedAccount = accountStore.get(account.id);
    if (storedAccount) account = { ...storedAccount, ...account, password: storedAccount.password };
  }

  // Validate input
  if (!account || !account.email || !account.password) {
    console.error("detectTier: Invalid account - email and password required");
    return "free";
  }

  // Check if tier is already cached (unless force refresh)
  if (!forceRefresh && account.id) {
    const storedAccount = accountStore.get(account.id);
    if (
      storedAccount &&
      storedAccount.metadata &&
      storedAccount.metadata.tierDetectedAt
    ) {
      // Return cached tier if it was detected within last 24 hours
      const cacheAge = Date.now() - storedAccount.metadata.tierDetectedAt;
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (cacheAge < twentyFourHours) {
        return storedAccount.tier || "free";
      }
    }
  }

  // Extract credentials for API requests
  const credentials = {
    email: account.email,
    password: account.password,
  };

  let detectedTier = "free"; // Default to free on any error
  let tierFromInfo = null; // Declare at function scope for later reference

  try {
    // Strategy 1: Try to get tier from account info endpoint
    tierFromInfo = await detectTierFromAccountInfo(credentials, throwOnTransportError);
    if (tierFromInfo) {
      detectedTier = tierFromInfo;
    } else {
      // Strategy 2: Test feature access to determine tier
      detectedTier = await detectTierFromFeatureAccess(credentials, throwOnTransportError);
    }
  } catch (error) {
    console.error("detectTier: Error during tier detection:", error.message);
    if (throwOnTransportError) throw error;
    // Fall through to use default "free" tier
  }

  // Cache the result if we have an account ID
  if (account.id) {
    try {
      const updateResult = accountStore.update(account.id, {
        tier: detectedTier,
        metadata: {
          ...(account.metadata || {}),
          tierDetectedAt: Date.now(),
          tierDetectionMethod: tierFromInfo ? "account-info" : "feature-access",
        },
      });

      if (!updateResult.success) {
        console.error(
          "detectTier: Failed to cache tier in accountStore:",
          updateResult.error
        );
      }
    } catch (error) {
      console.error("detectTier: Error caching tier:", error.message);
    }
  }

  return detectedTier;
}

/**
 * Batch detect tiers for multiple accounts
 *
 * Processes accounts sequentially to avoid overwhelming the API.
 * Adds a small delay between requests to be respectful of rate limits.
 *
 * @param {Array<Object>} accounts - Array of account objects
 * @param {Object} options - Detection options
 * @param {boolean} [options.forceRefresh=false] - Force re-detection
 * @param {number} [options.delayMs=500] - Delay between requests in milliseconds
 * @returns {Promise<Object>} Result with { detected: number, failed: number, results: Array }
 */
export async function batchDetectTiers(accounts, options = {}) {
  const { forceRefresh = false, delayMs = 500 } = options;

  const results = {
    detected: 0,
    failed: 0,
    results: [],
  };

  for (const account of accounts) {
    try {
      const tier = await detectTier(account, { forceRefresh, throwOnTransportError: true });
      results.detected++;
      results.results.push({
        email: account.email,
        tier,
        success: true,
      });
    } catch (error) {
      results.failed++;
      results.results.push({
        email: account.email,
        tier: "free",
        success: false,
        error: error.message,
      });
    }

    // Add delay between requests to avoid rate limiting
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
