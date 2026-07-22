/**
 * GET /v1/models — OpenAI-compatible model listing
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  // Forward to internal API
  const res = await fetch(new URL("/api/models", request.url));
  const data = await res.json();
  return Response.json(data, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
