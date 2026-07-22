#!/usr/bin/env node
/**
 * Test script to verify account import and database functionality
 * Usage: node src/scripts/test-account-import.js
 */

import { accountStore } from "../lib/accounts/store.js";

console.log("🔍 Testing Account Import System\n");

// Check database state
console.log("📊 Current Database State:");
const accounts = accountStore.list();
console.log(`   Total accounts: ${accounts.length}`);

if (accounts.length > 0) {
  console.log("\n✅ Existing accounts:");
  accounts.forEach((acc, i) => {
    console.log(`   ${i + 1}. ${acc.email || acc.id.slice(0, 8)} (${acc.provider}) - ${acc.tier}`);
  });
} else {
  console.log("   ⚠️  Database is empty - no accounts found");
}

// Test account creation
console.log("\n🧪 Testing Account Creation:");
const testAccount = {
  email: "test@example.com",
  password: "test-password-123",
  tier: "free",
  provider: "kiro",
};

console.log("   Creating test account...");
const result = accountStore.add(testAccount);

if (result.success) {
  console.log("   ✅ Test account created successfully");
  console.log(`   ID: ${result.account.id}`);

  // Verify it was saved
  const retrieved = accountStore.get(result.account.id);
  if (retrieved) {
    console.log("   ✅ Account verified in database");

    // Clean up test account
    accountStore.delete(result.account.id);
    console.log("   🧹 Test account cleaned up");
  } else {
    console.log("   ❌ Failed to retrieve test account");
  }
} else {
  console.log(`   ❌ Failed to create test account: ${result.error}`);
}

// Check database file
console.log("\n📁 Database File Info:");
import { existsSync, statSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "accounts.db");
if (existsSync(dbPath)) {
  const stats = statSync(dbPath);
  console.log(`   ✅ Database file exists: ${dbPath}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   Last modified: ${stats.mtime.toLocaleString()}`);
} else {
  console.log(`   ❌ Database file not found: ${dbPath}`);
}

console.log("\n✨ Test complete!");
