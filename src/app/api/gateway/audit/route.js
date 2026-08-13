import { NextResponse } from "next/server";
import { auditProviderEndpoint } from "@/lib/gateway/audit";
import { resolveProviderById } from "@/lib/gateway/config";
import { saveProviderAudit } from "@/lib/gateway/runtime-store";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
}

export async function POST(request) {
  if (request.cookies.get("kp-auth")?.value !== "authenticated") return unauthorized();
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const providerId = String(body.providerId || "").trim();
  if (!providerId) return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  try {
    const resolved = resolveProviderById(providerId);
    const model = String(body.model || resolved.provider.defaultModel || resolved.provider.models?.[0] || "").trim();
    if (!model) return NextResponse.json({ error: "Configure or refresh a model before auditing" }, { status: 400 });
    const probeCount = Math.max(1, Math.min(5, Number(body.probeCount) || 1));
    const contextSizes = [...new Set((Array.isArray(body.contextSizes) ? body.contextSizes : []).map(Number).filter((size) => [8000, 32000, 64000, 128000].includes(size)))].slice(0, 3);
    const audit = await auditProviderEndpoint({ provider: resolved.provider, apiKey: resolved.apiKey, model, probeCount, contextSizes });
    resolved.markCredentialResult(!audit.error, audit.probeStatus || audit.modelListStatus);
    const saved = saveProviderAudit(providerId, audit);
    return NextResponse.json(saved, { status: audit.error ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Endpoint audit failed" }, { status: 400 });
  }
}

export async function GET(request) {
  if (request.cookies.get("kp-auth")?.value !== "authenticated") return unauthorized();
  return NextResponse.json({ error: "Use POST with a providerId to run an authorized audit" }, { status: 405 });
}
