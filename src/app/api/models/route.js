/**
 * GET /api/models — returns legacy models plus explicitly configured gateway models.
 * GET /api/models?provider=<id> — filters by provider identifier.
 */
import { getAllModels, getModelsByProvider } from "@/lib/providers";
import { listGatewayModels } from "@/lib/gateway/config";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider");
  const legacyModels = providerId ? getModelsByProvider(providerId) : getAllModels();
  const openaiModels = legacyModels.map((model) => ({
    id: model.id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: model.provider,
    ...(model.contextLength ? { context_length: model.contextLength } : {}),
    ...(model.description ? { description: model.description } : {}),
  }));

  let gatewayModels = [];
  try { gatewayModels = listGatewayModels(); } catch { gatewayModels = []; }
  if (providerId) gatewayModels = gatewayModels.filter((model) => model.owned_by === providerId);

  return Response.json({ object: "list", data: [...openaiModels, ...gatewayModels] });
}
