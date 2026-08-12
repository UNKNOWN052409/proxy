import { NextResponse } from "next/server";
import { refreshGatewayModels, refreshGatewayProvider } from "@/lib/gateway/health";

export const runtime = "nodejs";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  try {
    const result = body.providerId
      ? await refreshGatewayProvider(body.providerId)
      : await refreshGatewayModels(body.providerIds ?? null);
    return NextResponse.json(result, { status: result.ok === false ? 502 : 200 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Gateway refresh failed" }, { status: 400 });
  }
}
