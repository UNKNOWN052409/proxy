/**
 * API Key Store
 *
 * SQLite-based storage for API keys with secure hashing and validation.
 * Keys are stored as SHA-256 hashes (never plaintext).
 *
 * Features:
 * - Secure storage with SHA-256 hashing
 * - Constant-time comparison to prevent timing attacks
 * - Automatic expiry handling
 * - Usage tracking (last_used_at)
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { hashApiKey, isValidKeyFormat } from './generator.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'api-keys.db');

/**
 * Initialize the SQLite database and create tables if they don't exist
 */
function initDatabase() {
  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.exec('PRAGMA journal_mode = WAL');

  // Create api_keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_key_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_expires_at ON api_keys(expires_at);
    CREATE INDEX IF NOT EXISTS idx_revoked_at ON api_keys(revoked_at);
  `);

  return db;
}

/**
 * Get database instance (singleton pattern)
 */
let dbInstance = null;
function getDatabase() {
  if (!dbInstance) {
    dbInstance = initDatabase();
    // Auto-cleanup expired keys on initialization
    cleanupExpiredKeys();
  }
  return dbInstance;
}

/**
 * Create a new API key in the store
 *
 * @param {Object} keyData - Key data from generator
 * @param {string} keyData.key - The plain API key (will be hashed)
 * @param {string} keyData.name - Human-readable name
 * @param {string} keyData.created_at - ISO 8601 creation timestamp
 * @param {string} keyData.expires_at - ISO 8601 expiration timestamp
 * @returns {Object} Created key metadata (without plain key)
 */
export function createKey(keyData) {
  const { key, name, created_at, expires_at } = keyData;

  if (!isValidKeyFormat(key)) {
    throw new Error('Invalid API key format');
  }

  const keyHash = hashApiKey(key);
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      INSERT INTO api_keys (name, key_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(name, keyHash, created_at, expires_at);

    return {
      id: result.lastInsertRowid,
      name,
      created_at,
      expires_at,
      last_used_at: null,
      revoked_at: null,
    };
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      throw new Error('API key already exists');
    }
    throw error;
  }
}

/**
 * Validate an API key using constant-time comparison
 *
 * @param {string} key - The plain API key to validate
 * @returns {Object|null} Key metadata if valid, null if invalid
 */
export function validateKey(key) {
  if (!isValidKeyFormat(key)) {
    return null;
  }

  const keyHash = hashApiKey(key);
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, name, key_hash, created_at, expires_at, last_used_at, revoked_at
    FROM api_keys
    WHERE revoked_at IS NULL
  `);

  const keys = stmt.all();

  // Use constant-time comparison to prevent timing attacks
  let matchedKey = null;
  const keyHashBuffer = Buffer.from(keyHash, 'hex');

  for (const storedKey of keys) {
    const storedHashBuffer = Buffer.from(storedKey.key_hash, 'hex');

    // Constant-time comparison
    if (keyHashBuffer.length === storedHashBuffer.length) {
      try {
        if (crypto.timingSafeEqual(keyHashBuffer, storedHashBuffer)) {
          matchedKey = storedKey;
          break;
        }
      } catch (error) {
        // Length mismatch, continue to next key
        continue;
      }
    }
  }

  if (!matchedKey) {
    return null;
  }

  // Check if key has expired
  const now = new Date();
  const expiresAt = new Date(matchedKey.expires_at);

  if (now > expiresAt) {
    return null; // Expired key
  }

  // Update last_used_at
  updateLastUsed(matchedKey.id);

  return {
    id: matchedKey.id,
    name: matchedKey.name,
    created_at: matchedKey.created_at,
    expires_at: matchedKey.expires_at,
    last_used_at: new Date().toISOString(),
  };
}

/**
 * Update the last_used_at timestamp for a key
 *
 * @param {number} keyId - The key ID
 */
function updateLastUsed(keyId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE api_keys
    SET last_used_at = ?
    WHERE id = ?
  `);

  stmt.run(new Date().toISOString(), keyId);
}

/**
 * Revoke an API key (soft delete)
 *
 * @param {number} keyId - The key ID to revoke
 * @returns {boolean} True if key was revoked, false if not found
 */
export function revokeKey(keyId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE api_keys
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `);

  const result = stmt.run(new Date().toISOString(), keyId);
  return result.changes > 0;
}

/**
 * List all API keys (non-revoked by default)
 *
 * @param {Object} options - List options
 * @param {boolean} [options.includeRevoked=false] - Include revoked keys
 * @param {boolean} [options.includeExpired=false] - Include expired keys
 * @returns {Array<Object>} Array of key metadata
 */
export function listKeys({ includeRevoked = false, includeExpired = false } = {}) {
  const db = getDatabase();

  let query = `
    SELECT id, name, created_at, expires_at, last_used_at, revoked_at
    FROM api_keys
  `;

  const conditions = [];
  if (!includeRevoked) {
    conditions.push('revoked_at IS NULL');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const keys = stmt.all();

  // Filter expired keys if needed
  if (!includeExpired) {
    const now = new Date();
    return keys.filter(key => {
      const expiresAt = new Date(key.expires_at);
      return now <= expiresAt;
    });
  }

  return keys;
}

/**
 * Get a specific key by ID
 *
 * @param {number} keyId - The key ID
 * @returns {Object|null} Key metadata or null if not found
 */
export function getKey(keyId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, created_at, expires_at, last_used_at, revoked_at
    FROM api_keys
    WHERE id = ?
  `);

  return stmt.get(keyId) || null;
}

/**
 * Clean up expired API keys (hard delete)
 *
 * @returns {number} Number of keys deleted
 */
export function cleanupExpiredKeys() {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    DELETE FROM api_keys
    WHERE expires_at < ?
  `);

  const result = stmt.run(now);
  return result.changes;
}

/**
 * Get statistics about API keys
 *
 * @returns {Object} Statistics object
 */
export function getStats() {
  const db = getDatabase();

  const total = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE revoked_at IS NULL').get().count;
  const expired = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE expires_at < ? AND revoked_at IS NULL')
    .get(new Date().toISOString()).count;
  const active = total - expired;
  const revoked = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE revoked_at IS NOT NULL').get().count;

  return {
    total,
    active,
    expired,
    revoked,
  };
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
