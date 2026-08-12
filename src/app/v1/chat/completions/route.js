import { validateKey } from "@/lib/api-keys/store";
import { executeGatewayChat } from "@/lib/gateway/service";
import { createSingleSseResponse, corsHeaders, getBearerToken, gatewayError, openAiErrorResponse, validateChatRequest } from "@/lib/gateway/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw gatewayError("Missing Bearer API key", 401, "authentication_error", "missing_api_key");
    if (!validateKey(token)) throw gatewayError("Invalid or expired API key", 401, "authentication_error", "invalid_api_key");

    let body;
    try {
      body = await request.json();
    } catch {
      throw gatewayError("Request body must contain valid JSON");
    }
    validateChatRequest(body);

    const { completion } = await executeGatewayChat(body);
    if (body.stream) return createSingleSseResponse(completion);
    return Response.json(completion, { headers: corsHeaders() });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
