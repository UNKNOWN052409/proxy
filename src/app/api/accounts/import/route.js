import { NextResponse } from "next/server";
import { importAuthorizedBulkPlan, parseAuthorizedImportText, summarizeAuthorizedImport } from "@/lib/gateway/bulk-import";
import { currentUser, requireRole } from "@/lib/platform/auth";

export const runtime = "nodejs";

function errorResponse(error) {
  return NextResponse.json({ error: error.message }, { status: error.status || 400 });
}

async function readImportRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.text !== "function") throw new Error("Select a JSON, CSV, or text token-list file");
    return {
      text: await file.text(),
      fileName: String(file.name || ""),
      format: String(form.get("format") || "auto"),
      providerId: String(form.get("providerId") || form.get("provider") || ""),
      dryRun: String(form.get("dryRun") || "") === "true",
      source: "authorized-file-import",
    };
  }

  const text = await request.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error("Import must be valid JSON"); }
  return {
    text: JSON.stringify(body?.data ? { data: body.data, provider: body.provider || body.providerId } : body),
    fileName: "import.json",
    format: "json",
    providerId: String(body?.providerId || body?.provider || ""),
    dryRun: body?.dryRun === true,
    source: "authorized-api-import",
  };
}

export async function POST(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const input = await readImportRequest(request);
    const plan = parseAuthorizedImportText(input.text, input);
    const preview = summarizeAuthorizedImport(plan);
    if (input.dryRun) return NextResponse.json({ success: true, dryRun: true, preview, rejected: plan.rejected });

    const result = importAuthorizedBulkPlan(plan, { source: input.source });
    return NextResponse.json({ ...result, preview });
  } catch (error) {
    return errorResponse(error);
  }
}
