import { NextResponse } from "next/server";
import { accountStore } from "@/lib/kiro/store";
import { currentUser, requireRole } from "@/lib/platform/auth";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const format = new URL(request.url).searchParams.get("format") || "metadata";
    let payload;
    let filename;
    if (format === "9router") {
      payload = { exportedAt: new Date().toISOString(), source: "kiro-proxy-sqlite", format, connections: accountStore.exportFormat9Router() };
      filename = "gateway-9router-export.json";
    } else {
      payload = accountStore.exportJson();
      payload.format = "metadata";
      payload.warning = "Secrets are excluded. Re-import explicit API/OAuth credentials through the encrypted credential flow.";
      filename = "gateway-accounts-metadata.json";
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 403 });
  }
}
