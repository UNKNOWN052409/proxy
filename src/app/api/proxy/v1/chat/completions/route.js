/**
 * POST /api/proxy/v1/chat/completions
 * OpenAI-compatible chat completions endpoint that proxies to Kiro AI.
 * Supports both streaming (SSE) and non-streaming responses.
 * Uses real AWS EventStream parser with account rotation and URL failover.
 */

import { executeKiroStream, executeKiroCompletion } from "@/lib/kiro/proxy";
import { accountStore } from "@/lib/kiro/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { stream = false } = body;

    // Get all active Kiro accounts
    const allAccounts = accountStore.getAll();
    const activeAccounts = allAccounts.filter(a => a.active !== false && a.provider === "kiro");

    if (activeAccounts.length === 0) {
      return Response.json(
        { error: { message: "No active Kiro accounts found. Add an account first.", type: "auth_error" } },
        { status: 401 }
      );
    }

    if (stream) {
      const result = await executeKiroStream(body, activeAccounts);

      if (result.error) {
        return Response.json(result, {
          status: result.status || 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // result is a Response (SSE stream) — return directly
      return result;
    } else {
      // Pick account for non-streaming request
      const account = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
      const result = await executeKiroCompletion(body, account);

      if (result.error) {
        return Response.json(result, { status: 500 });
      }

      return Response.json(result, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  } catch (err) {
    return Response.json(
      { error: { message: `Proxy error: ${err.message}`, type: "proxy_error" } },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
