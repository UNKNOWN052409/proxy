// src/lib/accounts/export.js
// Export accounts to JSON format

import { accountStore } from "./store.js";

/**
 * Export all accounts to JSON format
 *
 * NOTE: Passwords are stored as bcrypt hashes, not plaintext.
 * Exported passwords are hashes and cannot be used directly.
 *
 * @param {Object} options - Export options
 * @param {string} options.tier - Filter by tier
 * @param {string} options.provider - Filter by provider
 * @param {boolean} options.includePasswords - Include password hashes in export (default: false)
 * @returns {Object} Export data with metadata
 */
export function exportToJSON(options = {}) {
  const { tier, provider, includePasswords = false } = options;

  // Get accounts with filters
  const accounts = accountStore.list({ tier, provider });

  // Format accounts for export
  const exportAccounts = accounts.map((acct) => {
    const exported = {
      email: acct.email,
      tier: acct.tier,
      provider: acct.provider,
      metadata: acct.metadata,
    };

    // Include password if requested
    if (includePasswords) {
      exported.password = acct.password;
    }

    return exported;
  });

  // Return export data with metadata
  return {
    format: "kiro-proxy",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    count: exportAccounts.length,
    accounts: exportAccounts,
  };
}

/**
 * Export accounts to 9router-compatible format
 *
 * NOTE: Passwords are stored as bcrypt hashes, not plaintext.
 *
 * @param {boolean} includePasswords - Include password hashes in export (default: false)
 * @returns {Object} 9router format export
 */
export function exportTo9Router(includePasswords = false) {
  const accounts = accountStore.list();

  return {
    accounts: accounts.map((acct) => {
      const exported = {
        email: acct.email,
        tier: acct.tier,
        ...acct.metadata,
      };

      if (includePasswords) {
        exported.password = acct.password;
      }

      return exported;
    }),
  };
}

/**
 * Export accounts to OMNIROUTER-compatible format
 *
 * NOTE: Passwords are stored as bcrypt hashes, not plaintext.
 *
 * @param {boolean} includePasswords - Include password hashes in export (default: false)
 * @returns {Object} OMNIROUTER format export
 */
export function exportToOMNIROUTER(includePasswords = false) {
  const accounts = accountStore.list();

  return {
    connections: accounts.map((acct) => {
      const exported = {
        username: acct.email,
        tier: acct.tier,
        ...acct.metadata,
      };

      if (includePasswords) {
        exported.password = acct.password;
      }

      return exported;
    }),
  };
}

/**
 * Export accounts to file
 *
 * @param {string} filePath - Output file path
 * @param {string} format - Export format: "json", "9router", or "omnirouter"
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Result with { success: boolean, path?: string, error?: string }
 */
export async function exportToFile(filePath, format = "json", options = {}) {
  try {
    const { writeFile } = await import("fs/promises");

    let data;
    if (format === "9router") {
      data = exportTo9Router();
    } else if (format === "omnirouter") {
      data = exportToOMNIROUTER();
    } else {
      data = exportToJSON(options);
    }

    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    return {
      success: true,
      path: filePath,
      count: data.accounts?.length || data.connections?.length || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
