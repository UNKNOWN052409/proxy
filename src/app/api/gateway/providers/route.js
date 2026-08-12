import { NextResponse } from "next/server";
import { getGatewayProviders, getGatewayStatus } from "@/lib/gateway/config";
import { getGatewayRuntimeState, importProviderModels, mergeProviderConfiguration, restoreGatewayRuntimeState, setProviderEnabled } from "@/lib/gateway/runtime-store";
import { importEncryptedCredentials, listCredentialMetadata } from "@/lib/gateway/credentials";

export const runtime = "nodejs";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requireDashboardSession(request) {
  return request.cookies.get("kp-auth")?.value === "authenticated";
}

export async function GET(request) {
  if (!requireDashboardSession(request)) return error("Dashboard authentication required", 401);
  return NextResponse.json(getGatewayStatus());
}

export async function POST(request) {
  if (!requireDashboardSession(request)) return error("Dashboard authentication required", 401);
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
    if (action === "import_models") {
      const providerId = String(body.providerId || "").trim().toLowerCase();
      if (!providerId) return error("providerId is required");
      const provider = getGatewayProviders().find((candidate) => candidate.id === providerId);
      if (!provider) return error(`Unknown or unconfigured provider: ${providerId}`);
      const imported = importProviderModels(providerId, body.models, { replace: body.replace === true });
      return NextResponse.json({ ok: true, imported, status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "set_enabled") {
      const providerId = String(body.providerId || "");
      if (!providerId) return error("providerId is required");
      const setting = setProviderEnabled(providerId, body.enabled);
      return NextResponse.json({ ok: true, setting, status: getGatewayStatus() });
    }
    if (action === "import_credentials") {
      const providerId = String(body.providerId || "");
      const imported = importEncryptedCredentials(providerId, body.credentials);
      return NextResponse.json({ ok: true, imported, credentials: listCredentialMetadata(providerId), status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "list_credentials") {
      const providerId = String(body.providerId || "");
      return NextResponse.json({ ok: true, credentials: listCredentialMetadata(providerId) });
    }
    return error("Unsupported action");
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Gateway provider update failed");
  }
}
