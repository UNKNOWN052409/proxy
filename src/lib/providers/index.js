/**
 * Provider Registry — supports multiple free AI providers
 * Each provider has: config, models, auth methods, executor
 */

import { providerConfigs } from "./configs";

export const PROVIDERS = providerConfigs;

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || null;
}

export function getProvidersByCategory(category) {
  return PROVIDERS.filter(p => p.category === category);
}

export function getAllModels() {
  const models = [];
  for (const p of PROVIDERS) {
    for (const m of p.models || []) {
      models.push({
        id: `${p.alias}/${m.id}`,
        name: m.name,
        provider: p.id,
        providerName: p.display.name,
        providerColor: p.display.color,
        contextLength: m.contextLength || null,
        description: m.description || null,
      });
    }
  }
  return models;
}

export function getModelsByProvider(providerId) {
  const p = getProvider(providerId);
  if (!p) return [];
  return (p.models || []).map(m => ({
    id: `${p.alias}/${m.id}`,
    name: m.name,
    provider: p.id,
    contextLength: m.contextLength || null,
  }));
}

export function resolveModel(modelId) {
  // Parse "kr/claude-sonnet-4.5" or "oc/deepseek-v3"
  const parts = modelId.split("/");
  const alias = parts[0];
  const modelName = parts.slice(1).join("/");

  const provider = PROVIDERS.find(p => p.alias === alias);
  if (!provider) return null;

  const model = (provider.models || []).find(m => m.id === modelName);
  return model ? { provider, model } : { provider, model: { id: modelName, name: modelName } };
}
