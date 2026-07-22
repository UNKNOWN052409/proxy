/**
 * API Key Generator
 *
 * Generates cryptographically secure API keys in the format:
 * SK-proxy-{32-character-hex}
 *
 * Keys are generated using crypto.randomBytes for cryptographic security.
 * The plain key is only returned once at creation time.
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure API key
 *
 * @param {Object} options - Key generation options
 * @param {string} options.name - Human-readable name for the key
 * @param {number} [options.expiresInDays=90] - Number of days until key expires (default: 90)
 * @returns {Object} Key object with plain key (only shown once) and metadata
 *
 * @example
 * const key = generateApiKey({ name: 'Production Server', expiresInDays: 365 });
 * // Returns:
 * // {
 * //   key: 'SK-proxy-a1b2c3d4e5f6...',
 * //   name: 'Production Server',
 * //   created_at: '2024-01-15T10:30:00.000Z',
 * //   expires_at: '2025-01-15T10:30:00.000Z'
 * // }
 */
export function generateApiKey({ name, expiresInDays = 90 }) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Key name is required and must be a non-empty string');
  }

  if (typeof expiresInDays !== 'number' || expiresInDays <= 0) {
    throw new Error('expiresInDays must be a positive number');
  }

  // Generate 16 random bytes (will be 32 hex characters)
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');

  // Format: SK-proxy-{32-char-hex}
  const key = `SK-proxy-${hexString}`;

  // Calculate timestamps
  const createdAt = new Date();
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  return {
    key, // Plain key - only shown once!
    name: name.trim(),
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Validate the format of an API key
 *
 * @param {string} key - The API key to validate
 * @returns {boolean} True if key format is valid
 *
 * @example
 * isValidKeyFormat('SK-proxy-a1b2c3d4e5f6...') // true
 * isValidKeyFormat('invalid-key') // false
 */
export function isValidKeyFormat(key) {
  if (typeof key !== 'string') {
    return false;
  }

  // Check format: SK-proxy-{32 hex chars}
  const keyPattern = /^SK-proxy-[0-9a-f]{32}$/;
  return keyPattern.test(key);
}

/**
 * Extract the hex portion from an API key
 *
 * @param {string} key - The API key
 * @returns {string|null} The hex portion or null if invalid format
 *
 * @example
 * extractKeyHex('SK-proxy-abc123...') // 'abc123...'
 * extractKeyHex('invalid') // null
 */
export function extractKeyHex(key) {
  if (!isValidKeyFormat(key)) {
    return null;
  }

  return key.replace('SK-proxy-', '');
}

/**
 * Hash an API key for secure storage
 *
 * @param {string} key - The plain API key
 * @returns {string} SHA-256 hash of the key
 *
 * @example
 * const hash = hashApiKey('SK-proxy-abc123...');
 * // Returns: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 */
export function hashApiKey(key) {
  if (!isValidKeyFormat(key)) {
    throw new Error('Invalid API key format');
  }

  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate multiple API keys at once
 *
 * @param {Array<Object>} keyConfigs - Array of key configuration objects
 * @returns {Array<Object>} Array of generated key objects
 *
 * @example
 * const keys = generateMultipleKeys([
 *   { name: 'Dev Server', expiresInDays: 30 },
 *   { name: 'Prod Server', expiresInDays: 365 }
 * ]);
 */
export function generateMultipleKeys(keyConfigs) {
  if (!Array.isArray(keyConfigs)) {
    throw new Error('keyConfigs must be an array');
  }

  return keyConfigs.map(config => generateApiKey(config));
}

/**
 * Check if a key has expired based on its expiration date
 *
 * @param {string} expiresAt - ISO 8601 expiration date string
 * @returns {boolean} True if key has expired
 *
 * @example
 * isExpired('2024-01-01T00:00:00.000Z') // true (if current date is after)
 * isExpired('2099-12-31T23:59:59.999Z') // false
 */
export function isExpired(expiresAt) {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  return now > expirationDate;
}
