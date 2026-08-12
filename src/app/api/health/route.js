export async function GET() {
  return Response.json({ ok: true, service: "compliant-ai-gateway" }, { status: 200, headers: { "cache-control": "no-store" } });
}
