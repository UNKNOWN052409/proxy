import { validateKey } from "@/lib/api-keys/store";
import { listGatewayModels } from "@/lib/gateway/config";
import { corsHeaders, getBearerToken, gatewayError, openAiErrorResponse } from "@/lib/gateway/openai";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw gatewayError("Missing Bearer API key", 401, "authentication_error", "missing_api_key");
    if (!validateKey(token)) throw gatewayError("Invalid or expired API key", 401, "authentication_error", "invalid_api_key");
    return Response.json({ object: "list", data: listGatewayModels() }, { headers: corsHeaders() });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
