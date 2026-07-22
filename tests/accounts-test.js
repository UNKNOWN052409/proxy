// tests/accounts-test.js
// Basic tests for account import/export system

import { accountStore } from "../src/lib/accounts/store.js";
import { importAccounts, parse9Router, parseOMNIROUTER, parseLLN } from "../src/lib/accounts/import.js";
import { exportToJSON, exportTo9Router, exportToOMNIROUTER } from "../src/lib/accounts/export.js";
import { validateAccount, normalizeAccount } from "../src/lib/accounts/schema.js";

// Test data
const test9RouterData = {
  accounts: [
    { email: "user1@example.com", password: "pass123", tier: "pro" },
    { email: "user2@example.com", password: "pass456", tier: "free" },
  ],
};

const testOMNIROUTERData = {
  connections: [
    { username: "user3@example.com", password: "pass789", tier: "enterprise" },
    { username: "user4@example.com", password: "pass000" },
  ],
};

const testLLNData = [
  { email: "user5@example.com", password: "pass111" },
  { email: "user6@example.com", password: "pass222" },
];

// Helper function to run tests
function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

// Test suite
console.log("\n=== Account Import/Export System Tests ===\n");

let passed = 0;
let failed = 0;

// Test 1: Schema validation
if (runTest("Schema validation - valid account", () => {
  const result = validateAccount({
    email: "test@example.com",
    password: "password123",
    tier: "free",
    provider: "manual",
  });
  if (!result.valid) throw new Error("Should be valid");
})) passed++; else failed++;

if (runTest("Schema validation - invalid account (missing email)", () => {
  const result = validateAccount({
    password: "password123",
  });
  if (result.valid) throw new Error("Should be invalid");
  if (!result.errors.some(e => e.includes("Email"))) throw new Error("Should have email error");
})) passed++; else failed++;

// Test 2: Normalize account
if (runTest("Normalize account - username to email", () => {
  const result = normalizeAccount({ username: "user@example.com", password: "pass" }, "manual");
  if (result.email !== "user@example.com") throw new Error("Should normalize username to email");
})) passed++; else failed++;

// Test 3: Parse 9router format
if (runTest("Parse 9router format", () => {
  const accounts = parse9Router(test9RouterData);
  if (accounts.length !== 2) throw new Error(`Expected 2 accounts, got ${accounts.length}`);
  if (accounts[0].provider !== "9router") throw new Error("Provider should be 9router");
  if (accounts[0].tier !== "pro") throw new Error("Tier should be pro");
})) passed++; else failed++;

// Test 4: Parse OMNIROUTER format
if (runTest("Parse OMNIROUTER format", () => {
  const accounts = parseOMNIROUTER(testOMNIROUTERData);
  if (accounts.length !== 2) throw new Error(`Expected 2 accounts, got ${accounts.length}`);
  if (accounts[0].provider !== "OMNIROUTER") throw new Error("Provider should be OMNIROUTER");
  if (accounts[0].email !== "user3@example.com") throw new Error("Should convert username to email");
})) passed++; else failed++;

// Test 5: Parse lln format
if (runTest("Parse lln format", () => {
  const accounts = parseLLN(testLLNData);
  if (accounts.length !== 2) throw new Error(`Expected 2 accounts, got ${accounts.length}`);
  if (accounts[0].provider !== "lln") throw new Error("Provider should be lln");
  if (accounts[0].tier !== "free") throw new Error("Default tier should be free");
})) passed++; else failed++;

// Test 6: Auto-detect format
if (runTest("Auto-detect 9router format", () => {
  const result = importAccounts(test9RouterData, "auto");
  if (result.format !== "9router") throw new Error(`Expected 9router format, got ${result.format}`);
  if (result.success !== 2) throw new Error(`Expected 2 successful imports, got ${result.success}`);
})) passed++; else failed++;

// Test 7: Store operations - Clear first
console.log("\n--- Database Operations ---\n");
if (runTest("Clear database", () => {
  const result = accountStore.clear();
  if (!result.success) throw new Error("Clear failed");
})) passed++; else failed++;

// Test 8: Add account
if (runTest("Add account to store", () => {
  const result = accountStore.add({
    email: "store-test@example.com",
    password: "testpass",
    tier: "pro",
    provider: "manual",
  });
  if (!result.success) throw new Error(`Add failed: ${result.error}`);
  if (!result.account) throw new Error("Should return account");
})) passed++; else failed++;

// Test 9: Get account by email
if (runTest("Get account by email", () => {
  const account = accountStore.getByEmail("store-test@example.com");
  if (!account) throw new Error("Account not found");
  if (account.email !== "store-test@example.com") throw new Error("Wrong account");
  if (account.tier !== "pro") throw new Error("Wrong tier");
})) passed++; else failed++;

// Test 10: List accounts
if (runTest("List accounts", () => {
  const accounts = accountStore.list();
  if (accounts.length === 0) throw new Error("Should have at least one account");
})) passed++; else failed++;

// Test 11: Bulk import
if (runTest("Bulk import accounts", () => {
  const result = accountStore.bulkImport(parse9Router(test9RouterData), "9router");
  if (result.success !== 2) throw new Error(`Expected 2 successful imports, got ${result.success}`);
})) passed++; else failed++;

// Test 12: Count by tier
if (runTest("Count by tier", () => {
  const counts = accountStore.countByTier();
  if (counts.total === 0) throw new Error("Should have accounts");
  if (counts.pro === 0) throw new Error("Should have pro accounts");
})) passed++; else failed++;

// Test 13: Update account
if (runTest("Update account", () => {
  const account = accountStore.getByEmail("store-test@example.com");
  if (!account) throw new Error("Account not found");

  const result = accountStore.update(account.id, { tier: "enterprise" });
  if (!result.success) throw new Error(`Update failed: ${result.error}`);

  const updated = accountStore.get(account.id);
  if (updated.tier !== "enterprise") throw new Error("Tier not updated");
})) passed++; else failed++;

// Test 14: Export to JSON
if (runTest("Export to JSON", () => {
  const exported = exportToJSON();
  if (!exported.accounts) throw new Error("Should have accounts array");
  if (!exported.exportedAt) throw new Error("Should have exportedAt timestamp");
  if (exported.format !== "kiro-proxy") throw new Error("Wrong format");
})) passed++; else failed++;

// Test 15: Export to 9router format
if (runTest("Export to 9router format", () => {
  const exported = exportTo9Router();
  if (!exported.accounts) throw new Error("Should have accounts array");
  if (!Array.isArray(exported.accounts)) throw new Error("accounts should be array");
})) passed++; else failed++;

// Test 16: Export to OMNIROUTER format
if (runTest("Export to OMNIROUTER format", () => {
  const exported = exportToOMNIROUTER();
  if (!exported.connections) throw new Error("Should have connections array");
  if (!Array.isArray(exported.connections)) throw new Error("connections should be array");
})) passed++; else failed++;

// Test 17: Delete account
if (runTest("Delete account", () => {
  const account = accountStore.getByEmail("store-test@example.com");
  if (!account) throw new Error("Account not found");

  const result = accountStore.delete(account.id);
  if (!result.success) throw new Error(`Delete failed: ${result.error}`);

  const deleted = accountStore.get(account.id);
  if (deleted) throw new Error("Account should be deleted");
})) passed++; else failed++;

// Summary
console.log("\n=== Test Summary ===");
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed > 0) {
  process.exit(1);
}
