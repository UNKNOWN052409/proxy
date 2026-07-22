/**
 * GET /api/accounts/export — Export accounts in various formats
 * GET /api/accounts/export?format=9router — 9Router-compatible format
 */

import { accountStore } from "@/lib/accounts/store";
import { exportToJSON, exportTo9Router, exportToOMNIROUTER } from "@/lib/accounts/export";

export async function GET(request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "default";
  const source = url.searchParams.get("source") || "kiro-proxy";

  let data;
  let filename;

  // Get all accounts from store
  const accounts = accountStore.list();

  switch (format) {
    case "9router":
    case "kiro-ide":
      data = exportTo9Router(accounts);
      filename = format === "9router"
        ? `9router-kiro-accounts-${Date.now()}.json`
        : `kiro-ide-accounts-${Date.now()}.json`;
      break;
    case "omnirouter":
      data = exportToOMNIROUTER(accounts);
      filename = `omnirouter-accounts-${Date.now()}.json`;
      break;
    default:
      data = exportToJSON(accounts);
      filename = `kiro-proxy-accounts-${Date.now()}.json`;
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
