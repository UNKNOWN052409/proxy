/**
 * POST /v1/chat/completions — OpenAI-compatible chat completions
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  // Forward to internal proxy API
  const body = await request.json();
  const res = await fetch(new URL("/api/proxy/v1/chat/completions", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Streaming response
  if (body.stream) {
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const data = await res.json();
  return Response.json(data, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
