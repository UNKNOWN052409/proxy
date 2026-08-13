import { NextResponse } from "next/server";
import { accountStore } from "@/lib/kiro/store";
import { currentUser, requireRole } from "@/lib/platform/auth";

export const runtime = "nodejs";

function forbidden(error) { return NextResponse.json({ error: error.message }, { status: error.status || 403 }); }

export async function POST(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    let payload;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file.text !== "function") return NextResponse.json({ error: "A JSON file is required" }, { status: 400 });
      const text = await file.text();
      if (text.length > 5 * 1024 * 1024) return NextResponse.json({ error: "Import file exceeds 5 MB" }, { status: 413 });
      payload = JSON.parse(text);
    } else {
      const text = await request.text();
      if (text.length > 5 * 1024 * 1024) return NextResponse.json({ error: "Import payload exceeds 5 MB" }, { status: 413 });
      payload = JSON.parse(text);
    }
    const body = payload && typeof payload === "object" && !Array.isArray(payload) && payload.data ? payload.data : payload;
    const source = payload?.source || "authorized-token-import";
    const result = accountStore.importFromProxy(body, source);
    return NextResponse.json({ success: result.failed === 0, imported: result.success, skipped: result.failed, failed: result.failed, results: result.results, storage: "sqlite" });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Import must be valid JSON" }, { status: 400 });
    return forbidden(error);
  }
}
