import { NextResponse } from "next/server";
import { getGatewayStatus } from "@/lib/gateway/config";

export const runtime = "nodejs";

export async function GET() {
  const status = getGatewayStatus();
  return NextResponse.json({ notifications: status.notifications, generatedAt: new Date().toISOString() });
}
