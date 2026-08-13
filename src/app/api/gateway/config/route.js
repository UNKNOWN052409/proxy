import { NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/platform/auth";
import { getGatewayRuntimeState, mergeProviderConfiguration, importProviderModels } from "@/lib/gateway/runtime-store";

export const runtime = "nodejs";

function safeExport(state) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    storage: "sqlite",
    providers: Object.values(state.providers || {}).map((provider) => {
      const { apiKey, token, accessToken, refreshToken, password, cookie, cookies, headers, ...safe } = provider || {};
      return safe;
    }),
    modelCatalog: state.modelCatalog || {},
    health: state.health || {},
    audits: state.audits || {},
    lastRefreshAt: state.lastRefreshAt || null,
  };
}

export async function GET() {
  try {
    requireRole(await currentUser(), ["admin"]);
    return new NextResponse(JSON.stringify(safeExport(getGatewayRuntimeState()), null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=きgateway-config.json".replace("き", "gateway-"), "Cache-Control": "no-store" },
    });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 403 }); }
}

export async function POST(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A configuration object is required" }, { status: 400 });
    const providers = Array.isArray(body.providers) ? body.providers : [];
    const providerResults = providers.length ? mergeProviderConfiguration(providers) : [];
    const modelResults = [];
    for (const [providerId, catalog] of Object.entries(body.modelCatalog || {})) {
      if (catalog && Array.isArray(catalog.models)) modelResults.push(importProviderModels(providerId, catalog.models, { replace: body.replace === true }));
    }
    return NextResponse.json({ success: true, storage: "sqlite", providers: providerResults, models: modelResults });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 400 }); }
}
