/**
 * GET /api/models — returns models from all providers
 * GET /api/models?provider=kiro — filter by provider
 */

import { getAllModels, getModelsByProvider, getProvider } from "@/lib/providers";

export async function GET(request) {
  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider");

  let models;
  if (providerId) {
    models = getModelsByProvider(providerId);
  } else {
    models = getAllModels();
  }

  const openaiModels = models.map(m => ({
    id: m.id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: m.provider,
    ...(m.contextLength ? { context_length: m.contextLength } : {}),
    ...(m.description ? { description: m.description } : {}),
  }));

  return Response.json({
    object: "list",
    data: openaiModels,
  });
}
