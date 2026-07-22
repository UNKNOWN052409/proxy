#!/usr/bin/env node
/**
 * Test 9Router import with actual backup file
 */

import { readFileSync } from "fs";

const backupPath = "C:\\Users\\Unkno\\Downloads\\9router-backup-2026-07-20T13-48-01-185Z.json";

console.log("📥 Testing 9Router Import\n");

// Read the backup file
console.log("Reading backup file...");
const backupData = JSON.parse(readFileSync(backupPath, "utf-8"));

console.log(`✅ Backup file parsed successfully`);
console.log(`   Settings: ${Object.keys(backupData.settings).length} entries`);
console.log(`   Provider Connections: ${backupData.providerConnections?.length || 0} accounts\n`);

// Import via API
console.log("Testing import API...");

const testImport = async () => {
  try {
    const response = await fetch("http://localhost:3000/api/kiro/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: backupData,
        source: "9router",
        format: "auto",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`❌ Import failed: ${result.error}`);
      return;
    }

    console.log("\n✅ Import successful!");
    console.log(`   Imported: ${result.imported}`);
    console.log(`   Failed: ${result.failed}`);
    console.log(`   Total: ${result.total}`);

    if (result.failed > 0 && result.results) {
      console.log("\n⚠️  Failed imports:");
      result.results.filter(r => !r.ok).forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.error}`);
      });
    }

  } catch (error) {
    console.error(`❌ API call failed: ${error.message}`);
    console.log("\n💡 Make sure the dev server is running:");
    console.log("   npm run dev");
  }
};

testImport();
