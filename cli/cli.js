#!/usr/bin/env node

/**
 * kiro-proxy CLI — Universal AI Proxy
 * Usage:
 *   kiro-proxy serve [--port 20127]
 *   kiro-proxy import <file.json>
 *   kiro-proxy status
 *   kiro-proxy help
 */

import { createServer } from "./server.js";
import { readAccounts, importAccounts, getStatus } from "./lib.js";
import minimist from "minimist";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function showHelp() {
  console.log(`
╔══════════════════════════════════════╗
║        Kiro Proxy CLI v1.0.0        ║
╚══════════════════════════════════════╝

Usage:
  kiro-proxy serve [options]     Start the proxy server
  kiro-proxy import <file>       Import accounts from JSON file
  kiro-proxy status              Show proxy status
  kiro-proxy help                Show this help

Options:
  --port, -p    Port number (default: 20127)
  --host        Host address (default: 0.0.0.0)
  --verbose, -v Enable verbose logging

Examples:
  kiro-proxy serve
  kiro-proxy serve --port 3000
  kiro-proxy serve --verbose
  kiro-proxy import ./accounts.json
  kiro-proxy status
`);
}

const args = minimist(process.argv.slice(2), {
  alias: { p: "port", v: "verbose", h: "help" },
  default: { port: 20127, host: "0.0.0.0", verbose: false },
});

const command = args._[0] || "help";

switch (command) {
  case "serve":
    startServer(args);
    break;

  case "import":
    importFromFile(args);
    break;

  case "status":
    showStatus();
    break;

  default:
    showHelp();
}

// ─── Server ────────────────────────────────────────
async function startServer(opts) {
  console.log(`\n  🚀  Kiro Proxy v1.0.0`);
  console.log(`  ─────────────────────`);
  console.log(`  Port:     ${opts.port}`);
  console.log(`  Host:     ${opts.host}`);
  console.log(`  Verbose:  ${opts.verbose ? "yes" : "no"}`);
  console.log(`  Endpoint: http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`);
  console.log(`  Accounts: ${await countAccounts()}`);
  console.log(`  ─────────────────────\n`);

  const app = createServer(opts);

  app.listen(opts.port, opts.host, () => {
    console.log(`  ✓ Server running at http://localhost:${opts.port}`);
    console.log(`  ✓ OpenAI-compatible at http://localhost:${opts.port}/v1`);
    console.log();
  });
}

// ─── Import ────────────────────────────────────────
async function importFromFile(opts) {
  const filePath = path.resolve(opts._[1] || "");
  if (!filePath) {
    console.error("  ✗  Please specify a JSON file to import");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`  ✗  File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    const result = importAccounts(data);

    console.log(`\n  📥  Import Results`);
    console.log(`  ──────────────────`);

    if (result.success > 0) {
      console.log(`  ✓  ${result.success} account(s) imported successfully`);
    }
    if (result.failed > 0) {
      console.log(`  ✗  ${result.failed} account(s) failed`);
    }
    if (result.results.length > 0) {
      result.results.forEach(r => {
        if (r.ok) {
          console.log(`     ✓ ${r.email || r.id}`);
        } else {
          console.log(`     ✗ [${r.index}] ${r.error}`);
        }
      });
    }
    console.log(`  Total: ${result.total} account(s)`);
    console.log();
  } catch (err) {
    console.error(`  ✗  Error: ${err.message}`);
    process.exit(1);
  }
}

// ─── Status ────────────────────────────────────────
async function showStatus() {
  const stats = getStatus();

  console.log(`\n  📊  Kiro Proxy Status`);
  console.log(`  ────────────────────`);
  console.log(`  Accounts:  ${stats.totalAccounts}`);
  console.log(`  Active:    ${stats.activeAccounts}`);
  console.log(`  Usage:     ${stats.totalRequests || 0} total requests`);
  console.log(`  Data Dir:  ${stats.dataDir}`);
  console.log(`  Accounts:  ${stats.accountsFile}`);
  console.log();

  if (stats.recentModels?.length > 0) {
    console.log(`  Top Models:`);
    stats.recentModels.slice(0, 5).forEach(([model, count]) => {
      console.log(`    • ${model}: ${count} requests`);
    });
    console.log();
  }
}

async function countAccounts() {
  try {
    const stats = getStatus();
    return stats.activeAccounts;
  } catch { return 0; }
}
