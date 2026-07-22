// src/lib/accounts/schema.js
// Account schema definition and validation

/**
 * Valid tier values
 */
export const VALID_TIERS = ["free", "pro", "enterprise"];

/**
 * Valid provider values
 */
export const VALID_PROVIDERS = [
  // MITM providers
  "kiro",
  "opencode",
  "codex",
  "gemini",
  "github",
  "openrouter",
  "antigravity",
  "grok",
  "groq",
  "deepseek",
  "qwen",
  "perplexity",
  "cohere",
  "mistral",
  // OAuth + MITM providers
  "huggingface",
  "github-copilot",
  "azure-openai",
  "vertex-ai",
  // NO AUTH providers (local)
  "ollama",
  "lmstudio",
  // Legacy import sources
  "9router",
  "OMNIROUTER",
  "lln",
  "manual",
];

/**
 * Default tier if not specified
 */
export const DEFAULT_TIER = "free";

/**
 * Account schema definition
 *
 * @typedef {Object} Account
 * @property {string} id - Unique identifier (auto-generated UUID)
 * @property {string} email - Account email/username
 * @property {string} password - Account password
 * @property {string} tier - Account tier: "free", "pro", or "enterprise"
 * @property {string} provider - Source provider: "9router", "OMNIROUTER", "lln", or "manual"
 * @property {Object} metadata - Additional metadata (JSON object)
 * @property {number} createdAt - Creation timestamp (Unix epoch ms)
 * @property {number} updatedAt - Last update timestamp (Unix epoch ms)
 */

/**
 * Validate account data
 *
 * @param {Object} account - Account data to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateAccount(account) {
  const errors = [];

  // Required fields
  if (!account.email || typeof account.email !== "string" || account.email.trim() === "") {
    errors.push("Email is required and must be a non-empty string");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) {
    errors.push("Email must be a valid email address format");
  }

  if (!account.password || typeof account.password !== "string" || account.password.trim() === "") {
    errors.push("Password is required and must be a non-empty string");
  } else if (account.password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  // Tier validation
  if (account.tier && !VALID_TIERS.includes(account.tier)) {
    errors.push(`Invalid tier: ${account.tier}. Must be one of: ${VALID_TIERS.join(", ")}`);
  }

  // Provider validation
  if (account.provider && !VALID_PROVIDERS.includes(account.provider)) {
    errors.push(`Invalid provider: ${account.provider}. Must be one of: ${VALID_PROVIDERS.join(", ")}`);
  }

  // Metadata validation
  if (account.metadata !== undefined && typeof account.metadata !== "object") {
    errors.push("Metadata must be an object");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize account data to schema
 * Fills in defaults and ensures all required fields are present
 *
 * @param {Object} data - Raw account data
 * @param {string} defaultProvider - Default provider if not specified
 * @returns {Object} Normalized account data
 */
export function normalizeAccount(data, defaultProvider = "manual") {
  const normalized = {
    // Email - try multiple field names
    email: data.email || data.username || data.user || "",

    // Password
    password: data.password || data.pass || "",

    // Tier - default to free if not specified or invalid
    tier: VALID_TIERS.includes(data.tier) ? data.tier : DEFAULT_TIER,

    // Provider
    provider: VALID_PROVIDERS.includes(data.provider) ? data.provider : defaultProvider,

    // Metadata - preserve any extra fields
    metadata: data.metadata || {},
  };

  // Trim whitespace
  normalized.email = normalized.email.trim();
  normalized.password = normalized.password.trim();

  // Add any extra fields to metadata
  const knownFields = ["email", "username", "user", "password", "pass", "tier", "provider", "metadata"];
  for (const [key, value] of Object.entries(data)) {
    if (!knownFields.includes(key) && value !== undefined) {
      normalized.metadata[key] = value;
    }
  }

  return normalized;
}

/**
 * Create a new account object with timestamps and ID
 *
 * @param {Object} data - Account data (must be normalized)
 * @param {string} id - Optional ID (generated if not provided)
 * @returns {Object} Complete account object
 */
export function createAccount(data, id = null) {
  const now = Date.now();

  return {
    id: id || crypto.randomUUID(),
    email: data.email,
    password: data.password,
    tier: data.tier || DEFAULT_TIER,
    provider: data.provider || "manual",
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
}
