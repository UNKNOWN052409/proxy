// src/lib/accounts/import.js
// Import accounts from various proxy formats (9router, OMNIROUTER, lln)

import { normalizeAccount, validateAccount, DEFAULT_TIER } from "./schema.js";

/**
 * Parse 9router format
 * Expected format: { accounts: [{ email, password, tier?, ...metadata }] }
 *
 * @param {Object|Array} data - Raw 9router data
 * @returns {Array} Array of normalized account objects
 */
export function parse9Router(data) {
  try {
    // Handle both { accounts: [...] } and direct array
    const accounts = Array.isArray(data) ? data : data.accounts || [];

    if (!Array.isArray(accounts)) {
      throw new Error("Invalid 9router format: expected array of accounts");
    }

    return accounts.map((acct) => {
      const normalized = normalizeAccount(acct, "9router");
      return normalized;
    });
  } catch (error) {
    console.error("Failed to parse 9router format:", error.message);
    return [];
  }
}

/**
 * Parse OMNIROUTER format
 * Expected format: { connections: [{ username, password, tier?, ...metadata }] }
 *
 * @param {Object|Array} data - Raw OMNIROUTER data
 * @returns {Array} Array of normalized account objects
 */
export function parseOMNIROUTER(data) {
  try {
    // Handle both { connections: [...] } and direct array
    const connections = Array.isArray(data) ? data : data.connections || data.accounts || [];

    if (!Array.isArray(connections)) {
      throw new Error("Invalid OMNIROUTER format: expected array of connections");
    }

    return connections.map((conn) => {
      // OMNIROUTER may use "username" instead of "email"
      const normalized = normalizeAccount(
        {
          ...conn,
          email: conn.email || conn.username || conn.user,
        },
        "OMNIROUTER"
      );
      return normalized;
    });
  } catch (error) {
    console.error("Failed to parse OMNIROUTER format:", error.message);
    return [];
  }
}

/**
 * Parse lln proxy format
 * Expected format: [{ email, password }] or similar simple array
 *
 * @param {Array|Object} data - Raw lln proxy data
 * @returns {Array} Array of normalized account objects
 */
export function parseLLN(data) {
  try {
    // Handle direct array or wrapped object
    let accounts = Array.isArray(data) ? data : [];

    // If not an array, check for common wrapper keys
    if (!Array.isArray(data) && typeof data === "object") {
      accounts = data.accounts || data.proxies || data.credentials || [];
    }

    if (!Array.isArray(accounts)) {
      throw new Error("Invalid lln format: expected array of accounts");
    }

    return accounts.map((acct) => {
      const normalized = normalizeAccount(acct, "lln");
      return normalized;
    });
  } catch (error) {
    console.error("Failed to parse lln format:", error.message);
    return [];
  }
}

/**
 * Auto-detect format and parse
 * Tries to detect format based on structure and field names
 *
 * @param {Object|Array} data - Raw import data
 * @returns {Object} Result with { format: string, accounts: Array }
 */
export function autoDetectFormat(data) {
  // Check for 9router format indicators
  if (data.accounts && Array.isArray(data.accounts)) {
    // Look for 9router-specific fields or patterns
    const firstAccount = data.accounts[0];
    if (firstAccount && (firstAccount.email || firstAccount.password)) {
      return {
        format: "9router",
        accounts: parse9Router(data),
      };
    }
  }

  // Check for OMNIROUTER format indicators
  if (data.connections && Array.isArray(data.connections)) {
    return {
      format: "OMNIROUTER",
      accounts: parseOMNIROUTER(data),
    };
  }

  // Check if it's a direct array (likely lln format)
  if (Array.isArray(data)) {
    return {
      format: "lln",
      accounts: parseLLN(data),
    };
  }

  // Default to trying 9router format
  return {
    format: "unknown",
    accounts: parse9Router(data),
  };
}

/**
 * Import accounts from raw data with format detection
 *
 * @param {Object|Array|string} data - Raw import data (object, array, or JSON string)
 * @param {string} format - Optional format hint: "9router", "OMNIROUTER", "lln", or "auto"
 * @returns {Object} Result with { success: number, failed: number, format: string, accounts: Array, errors: Array }
 */
export function importAccounts(data, format = "auto") {
  const result = {
    success: 0,
    failed: 0,
    format: format,
    accounts: [],
    errors: [],
  };

  try {
    // Parse JSON string if needed
    let parsedData = data;
    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch (error) {
        result.errors.push({
          error: "Invalid JSON format",
          details: error.message,
        });
        return result;
      }
    }

    // Parse based on format
    let accounts = [];
    if (format === "auto") {
      const detected = autoDetectFormat(parsedData);
      result.format = detected.format;
      accounts = detected.accounts;
    } else if (format === "9router") {
      accounts = parse9Router(parsedData);
    } else if (format === "OMNIROUTER") {
      accounts = parseOMNIROUTER(parsedData);
    } else if (format === "lln") {
      accounts = parseLLN(parsedData);
    } else {
      result.errors.push({
        error: `Unknown format: ${format}`,
      });
      return result;
    }

    // Validate each account
    for (const acct of accounts) {
      const validation = validateAccount(acct);
      if (validation.valid) {
        result.accounts.push(acct);
        result.success++;
      } else {
        result.failed++;
        result.errors.push({
          email: acct.email,
          errors: validation.errors,
        });
      }
    }

    return result;
  } catch (error) {
    result.errors.push({
      error: "Import failed",
      details: error.message,
    });
    return result;
  }
}

/**
 * Import accounts from file
 *
 * @param {string} filePath - Path to import file
 * @param {string} format - Optional format hint
 * @returns {Promise<Object>} Import result
 */
export async function importFromFile(filePath, format = "auto") {
  try {
    const { readFile } = await import("fs/promises");
    const content = await readFile(filePath, "utf-8");
    return importAccounts(content, format);
  } catch (error) {
    return {
      success: 0,
      failed: 0,
      format: "unknown",
      accounts: [],
      errors: [
        {
          error: "Failed to read file",
          details: error.message,
        },
      ],
    };
  }
}
