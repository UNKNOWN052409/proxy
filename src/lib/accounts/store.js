// src/lib/accounts/store.js
// SQLite storage for account credentials

import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { validateAccount, normalizeAccount, createAccount, DEFAULT_TIER } from "./schema.js";

// Get database path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_DIR = join(__dirname, "../../../data");
const DB_PATH = join(DB_DIR, "accounts.db");

/**
 * Ensure database directory exists
 */
function ensureDbDir() {
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
}

/**
 * Initialize database and create tables
 */
function initDatabase() {
  ensureDbDir();

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");

  // Create accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      provider TEXT NOT NULL DEFAULT 'manual',
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier);
    CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider);
  `);

  return db;
}

/**
 * AccountStore class - manages account CRUD operations
 */
class AccountStore {
  constructor() {
    this.db = initDatabase();
  }

  /**
   * Add a new account
   *
   * @param {Object} data - Account data
   * @returns {Object} Result with { success: boolean, account?: Object, error?: string }
   */
  add(data) {
    try {
      // Normalize and validate
      const normalized = normalizeAccount(data, data.provider || "manual");
      const validation = validateAccount(normalized);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join("; "),
        };
      }

      // Create account with ID and timestamps
      const account = createAccount(normalized);

      // Hash password before storing
      const hashedPassword = bcrypt.hashSync(account.password, 10);

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO accounts (id, email, password, tier, provider, metadata, created_at, updated_at)
        VALUES (@id, @email, @password, @tier, @provider, @metadata, @createdAt, @updatedAt)
      `);

      stmt.run({
        id: account.id,
        email: account.email,
        password: hashedPassword,
        tier: account.tier,
        provider: account.provider,
        metadata: JSON.stringify(account.metadata),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      });

      return {
        success: true,
        account: {
          ...account,
          password: undefined, // Don't leak plaintext password
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account by ID
   *
   * @param {string} id - Account ID
   * @returns {Object|null} Account object or null if not found
   */
  get(id) {
    try {
      const stmt = this.db.prepare("SELECT * FROM accounts WHERE id = ?");
      const row = stmt.get(id);

      if (!row) {
        return null;
      }

      return this._rowToAccount(row);
    } catch (error) {
      console.error("Failed to get account:", error.message);
      return null;
    }
  }

  /**
   * Get account by email
   *
   * @param {string} email - Account email
   * @returns {Object|null} Account object or null if not found
   */
  getByEmail(email) {
    try {
      const stmt = this.db.prepare("SELECT * FROM accounts WHERE email = ? LIMIT 1");
      const row = stmt.get(email);

      if (!row) {
        return null;
      }

      return this._rowToAccount(row);
    } catch (error) {
      console.error("Failed to get account by email:", error.message);
      return null;
    }
  }

  /**
   * List all accounts with optional filtering
   *
   * @param {Object} options - Query options
   * @param {string} options.tier - Filter by tier
   * @param {string} options.provider - Filter by provider
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of account objects
   */
  list(options = {}) {
    try {
      let query = "SELECT * FROM accounts WHERE 1=1";
      const params = [];

      if (options.tier) {
        query += " AND tier = ?";
        params.push(options.tier);
      }

      if (options.provider) {
        query += " AND provider = ?";
        params.push(options.provider);
      }

      query += " ORDER BY created_at DESC";

      if (options.limit) {
        query += " LIMIT ?";
        params.push(options.limit);
      }

      if (options.offset) {
        query += " OFFSET ?";
        params.push(options.offset);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);

      return rows.map((row) => this._rowToAccount(row));
    } catch (error) {
      console.error("Failed to list accounts:", error.message);
      return [];
    }
  }

  /**
   * Update account
   *
   * @param {string} id - Account ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Result with { success: boolean, error?: string }
   */
  update(id, updates) {
    try {
      const existing = this.get(id);
      if (!existing) {
        return {
          success: false,
          error: "Account not found",
        };
      }

      // Merge updates with existing data
      const merged = { ...existing, ...updates };
      const validation = validateAccount(merged);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join("; "),
        };
      }

      // Update timestamp
      merged.updatedAt = Date.now();

      // Hash password if it's being updated
      const passwordToStore = updates.password
        ? bcrypt.hashSync(updates.password, 10)
        : existing.password;

      const stmt = this.db.prepare(`
        UPDATE accounts
        SET email = @email, password = @password, tier = @tier,
            provider = @provider, metadata = @metadata, updated_at = @updatedAt
        WHERE id = @id
      `);

      stmt.run({
        id,
        email: merged.email,
        password: passwordToStore,
        tier: merged.tier,
        provider: merged.provider,
        metadata: JSON.stringify(merged.metadata),
        updatedAt: merged.updatedAt,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete account
   *
   * @param {string} id - Account ID
   * @returns {Object} Result with { success: boolean, error?: string }
   */
  delete(id) {
    try {
      const stmt = this.db.prepare("DELETE FROM accounts WHERE id = ?");
      const result = stmt.run(id);

      if (result.changes === 0) {
        return {
          success: false,
          error: "Account not found",
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Bulk import accounts
   *
   * @param {Array} accounts - Array of account data
   * @param {string} defaultProvider - Default provider for accounts
   * @returns {Object} Result with { success: number, failed: number, errors: Array }
   */
  bulkImport(accounts, defaultProvider = "manual") {
    const importTransaction = this.db.transaction(() => {
      const results = { success: 0, failed: 0, errors: [] };

      for (const data of accounts) {
        try {
          const normalized = normalizeAccount(data, data.provider || defaultProvider);
          const validation = validateAccount(normalized);

          if (!validation.valid) {
            results.failed++;
            results.errors.push({
              email: data.email || data.username,
              error: validation.errors.join("; "),
            });
            continue;
          }

          const account = createAccount(normalized);

          // Auto-detect if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
          const isAlreadyHashed = /^\$2[aby]\$/.test(account.password);
          const passwordToStore = isAlreadyHashed
            ? account.password
            : bcrypt.hashSync(account.password, 10);

          this.db.prepare(`
            INSERT INTO accounts (id, email, password, tier, provider, metadata, created_at, updated_at)
            VALUES (@id, @email, @password, @tier, @provider, @metadata, @createdAt, @updatedAt)
          `).run({
            id: account.id,
            email: account.email,
            password: passwordToStore,
            tier: account.tier,
            provider: account.provider,
            metadata: JSON.stringify(account.metadata),
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            email: data.email || data.username,
            error: error.message,
          });
        }
      }

      return results;
    });

    return importTransaction();
  }

  /**
   * Get account count by tier
   *
   * @returns {Object} Object with tier counts
   */
  countByTier() {
    try {
      const stmt = this.db.prepare("SELECT tier, COUNT(*) as count FROM accounts GROUP BY tier");
      const rows = stmt.all();

      const counts = { free: 0, pro: 0, enterprise: 0, total: 0 };
      for (const row of rows) {
        counts[row.tier] = row.count;
        counts.total += row.count;
      }

      return counts;
    } catch (error) {
      console.error("Failed to count by tier:", error.message);
      return { free: 0, pro: 0, enterprise: 0, total: 0 };
    }
  }

  /**
   * Clear all accounts
   * WARNING: This is destructive and cannot be undone
   *
   * @returns {Object} Result with { success: boolean, deleted: number, error?: string }
   */
  clear() {
    try {
      const countStmt = this.db.prepare("SELECT COUNT(*) as count FROM accounts");
      const { count } = countStmt.get();

      const stmt = this.db.prepare("DELETE FROM accounts");
      stmt.run();

      return {
        success: true,
        deleted: count,
      };
    } catch (error) {
      return {
        success: false,
        deleted: 0,
        error: error.message,
      };
    }
  }

  /**
   * Convert database row to account object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Account object
   */
  _rowToAccount(row) {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      tier: row.tier,
      provider: row.provider,
      metadata: JSON.parse(row.metadata || "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Verify password for an account
   *
   * @param {string} email - Account email
   * @param {string} plainPassword - Plaintext password to verify
   * @returns {Object} Result with { valid: boolean, accountId?: string }
   */
  verifyPassword(email, plainPassword) {
    try {
      const account = this.getByEmail(email);
      if (!account) {
        return { valid: false };
      }

      const isValid = bcrypt.compareSync(plainPassword, account.password);
      return {
        valid: isValid,
        accountId: isValid ? account.id : undefined,
      };
    } catch (error) {
      console.error("Failed to verify password:", error.message);
      return { valid: false };
    }
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export singleton instance
export const accountStore = new AccountStore();
