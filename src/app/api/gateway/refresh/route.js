import { NextResponse } from "next/server";
import { refreshGatewayModels, refreshGatewayProvider } from "@/lib/gateway/health";
import { getRefreshSchedulerStatus, startRefreshScheduler, stopRefreshScheduler } from "@/lib/gateway/refresh-scheduler";

export const runtime = "nodejs";

export async function GET(request) {
  if (request.cookies.get("kp-auth")?.value !== "authenticated") {
    return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
  }
  return NextResponse.json(getRefreshSchedulerStatus());
}

export async function POST(request) {
  if (request.cookies.get("kp-auth")?.value !== "authenticated") {
    return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
  }
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  try {
    if (body.action === "start") return NextResponse.json(startRefreshScheduler({ intervalMs: body.intervalMs, providerIds: body.providerIds ?? null, runImmediately: body.runImmediately !== false }));
    if (body.action === "stop") return NextResponse.json(stopRefreshScheduler());
    const result = body.providerId
      ? await refreshGatewayProvider(body.providerId)
      : await refreshGatewayModels(body.providerIds ?? null);
    return NextResponse.json(result, { status: result.ok === false ? 502 : 200 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Gateway refresh failed" }, { status: 400 });
  }
}
