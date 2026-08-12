import { NextResponse } from "next/server";
import { getGatewayProviders, getGatewayStatus } from "@/lib/gateway/config";
import { getGatewayRuntimeState, mergeProviderConfiguration, restoreGatewayRuntimeState, setProviderEnabled } from "@/lib/gateway/runtime-store";

export const runtime = "nodejs";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  return NextResponse.json(getGatewayStatus());
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return error("Request body must be valid JSON"); }
  const action = String(body?.action || "import");

  try {
    if (action === "import") {
      const before = getGatewayRuntimeState();
      const results = mergeProviderConfiguration(body.providers);
      try {
        getGatewayProviders();
      } catch (validationError) {
        restoreGatewayRuntimeState(before);
        throw validationError;
      }
      return NextResponse.json({ ok: true, results, status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "set_enabled") {
      const providerId = String(body.providerId || "");
      if (!providerId) return error("providerId is required");
      const setting = setProviderEnabled(providerId, body.enabled);
      return NextResponse.json({ ok: true, setting, status: getGatewayStatus() });
    }
    return error("Unsupported action");
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Gateway provider update failed");
  }
}
