/**
 * POST /api/kiro/import
 * Import Kiro accounts from various sources (9Router, Kiro IDE, CLI proxy, etc.)
 * Accumulates — importing again adds to existing accounts.
 */

import { accountStore } from "@/lib/kiro/store";

export async function POST(request) {
  try {
    const body = await request.json();
    const { accounts, source = "manual", format } = body;

    if (!accounts) {
      return Response.json({ error: "No accounts data provided" }, { status: 400 });
    }

    let result;

    if (format === "9router" || format === "kiro-ide" || format === "proxy") {
      // Use format-aware import
      result = accountStore.importFromProxy(accounts, source);
    } else {
      // Auto-detect format
      const list = Array.isArray(accounts) ? accounts : (accounts.accounts || accounts.connections || [accounts]);
      result = accountStore.bulkImport(
        list.map(item => ({
          accessToken: item.accessToken || item.token || item.access_token || null,
          refreshToken: item.refreshToken || item.refresh_token || null,
          email: item.email || null,
          providerSpecificData: item.providerSpecificData || {},
          authType: item.authType || item.auth_type || "oauth",
          source,
          label: item.label || item.email || null,
        })),
        source
      );
    }

    return Response.json({
      success: true,
      imported: result.success,
      failed: result.failed,
      total: result.success + result.failed,
      results: result.results,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    message: "Kiro Import API",
    description: "POST accounts data to import from 9Router, Kiro IDE, or other proxies",
    usage: {
      endpoint: "POST /api/kiro/import",
      body: {
        accounts: "Array of account objects (or { accounts: [...] })",
        source: "Optional source identifier (default: 'manual')",
        format: "Optional: '9router', 'kiro-ide', 'proxy', or auto-detect",
      },
    },
  });
}
