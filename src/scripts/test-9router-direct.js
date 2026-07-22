#!/usr/bin/env node
/**
 * Direct test of 9Router import using account store
 */

import { readFileSync } from "fs";
import { accountStore } from "../lib/accounts/store.js";

const backupPath = "C:\\Users\\Unkno\\Downloads\\9router-backup-2026-07-20T13-48-01-185Z.json";

console.log("📥 Testing 9Router Import (Direct)\n");

// Read backup file
const backupData = JSON.parse(readFileSync(backupPath, "utf-8"));

console.log("📊 Backup File Structure:");
console.log(`   Provider Connections: ${backupData.providerConnections?.length || 0}`);
console.log(`   Settings: ${Object.keys(backupData.settings || {}).length} entries\n`);

// Check current database state
console.log("🗄️  Current Database State:");
const before = accountStore.list();
console.log(`   Accounts before import: ${before.length}\n`);

// Import provider connections as accounts
console.log("🔄 Importing accounts...");
let imported = 0;
let failed = 0;
const errors = [];

// Helper to check if string is valid email
const isValidEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

for (const conn of backupData.providerConnections || []) {
  // Extract email/identifier - prioritize actual emails
  let email;
  if (conn.email && isValidEmail(conn.email)) {
    email = conn.email;
  } else if (conn.username && isValidEmail(conn.username)) {
    email = conn.username;
  } else {
    // Generate synthetic email from ID or create new one
    const identifier = conn.id || conn.username || `account-${imported}`;
    email = `${identifier.replace(/[^a-zA-Z0-9-]/g, '-')}@9router.imported`;
  }

  // Use API key as password if available, otherwise generate one
  const password = conn.apiKey || conn.password || `imported-${crypto.randomUUID()}`;

  const accountData = {
    email,
    password,
    tier: "free",
    provider: "9router",
    metadata: {
      originalConnection: conn,
      importedAt: new Date().toISOString(),
      testStatus: conn.testStatus,
      lastUsedAt: conn.lastUsedAt,
      originalId: conn.id,
      originalEmail: conn.email,
    },
  };

  const result = accountStore.add(accountData);

  if (result.success) {
    imported++;
    console.log(`   ✅ Imported: ${email}${conn.email && email !== conn.email ? ` (original: ${conn.id || conn.email})` : ''}`);
  } else {
    failed++;
    errors.push({ email, error: result.error });
    console.log(`   ❌ Failed: ${email} - ${result.error}`);
  }
}

// Check final state
console.log(`\n📊 Import Results:`);
console.log(`   ✅ Imported: ${imported}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📦 Total: ${imported + failed}`);

const after = accountStore.list();
console.log(`\n🗄️  Database After Import:`);
console.log(`   Total accounts: ${after.length}`);

if (errors.length > 0 && errors.length <= 5) {
  console.log(`\n⚠️  Failed Imports:`);
  errors.forEach((e, i) => {
    console.log(`   ${i + 1}. ${e.email}: ${e.error}`);
  });
} else if (errors.length > 5) {
  console.log(`\n⚠️  ${errors.length} imports failed (showing first 5):`);
  errors.slice(0, 5).forEach((e, i) => {
    console.log(`   ${i + 1}. ${e.email}: ${e.error}`);
  });
}

console.log("\n✨ Test complete!");
