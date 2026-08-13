import { validateKey } from "@/lib/api-keys/store";
import { executeGatewayImage } from "@/lib/gateway/service";
import { corsHeaders, gatewayError, getBearerToken, openAiErrorResponse } from "@/lib/gateway/openai";
import { canUse } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw gatewayError("Missing Bearer API key", 401, "authentication_error", "missing_api_key");
    const keyRecord = validateKey(token);
    if (!keyRecord) throw gatewayError("Invalid or expired API key", 401, "authentication_error", "invalid_api_key");
    let body;
    try { body = await request.json(); } catch { throw gatewayError("Request body must contain valid JSON", 400, "invalid_request_error"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw gatewayError("Request body must be a JSON object", 400, "invalid_request_error");
    if (typeof body.model !== "string" || !body.model.trim()) throw gatewayError("model is required", 400, "invalid_request_error");
    const providerId = body.provider || body.provider_id || null;
    if (!canUse({ provider_ids: keyRecord.provider_ids || [], model_ids: keyRecord.model_ids || [] }, { providerId, modelId: body.model })) {
      throw gatewayError("This API key is not allowed to use the requested provider or model", 403, "permission_error", "scope_denied");
    }
    body.idempotency_key = body.idempotency_key || request.headers.get("idempotency-key") || undefined;
    body.request_id = request.headers.get("x-request-id") || crypto.randomUUID();
    body.priority = body.priority || request.headers.get("x-gateway-priority") || "normal";
    const result = await executeGatewayImage(body);
    return Response.json(result, { headers: corsHeaders() });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
