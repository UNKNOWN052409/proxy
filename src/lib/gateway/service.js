import { getGatewayProviders, resolveProvider, resolveProviderById } from "./config.js";
import { createChatCompletion, gatewayError, hasImages, messageText } from "./openai.js";
import { buildToolInstruction, parseClientManagedToolResponse } from "./tools.js";
import { convertImagesToText } from "./vision.js";
import { executeOpenAi, describeImageWithOpenAi } from "./providers/openai.js";
import { executeAnthropic, describeImageWithAnthropic } from "./providers/anthropic.js";
import { executeGitLab } from "./providers/gitlab.js";
import { executeBedrock } from "./providers/bedrock.js";
import { executeQwen, describeImageWithQwen } from "./providers/qwen.js";
import { usageStore } from "../usage/store.js";

function executorFor(provider) {
  if (provider.adapter === "qwen" || provider.id === "qwen") return executeQwen;
  if (provider.adapter === "gitlab" || provider.type === "gitlab") return executeGitLab;
  if (provider.type === "bedrock" || provider.adapter === "bedrock") return executeBedrock;
  if (provider.type === "openai" || provider.type === "custom") return executeOpenAi;
  if (provider.type === "anthropic") return executeAnthropic;
  throw gatewayError(`Unsupported provider type: ${provider.type}`, 400, "invalid_provider");
}

function visionExecutorFor(provider) {
  if (provider.adapter === "qwen" || provider.id === "qwen") return describeImageWithQwen;
  if (provider.type === "openai" || provider.type === "custom") return describeImageWithOpenAi;
  if (provider.type === "anthropic") return describeImageWithAnthropic;
  if (provider.type === "bedrock") return null;
  throw gatewayError(`Unsupported vision provider type: ${provider.type}`, 400, "invalid_provider");
}

function resolveVisionModel(provider) {
  const model = provider.defaultModel || provider.models[0];
  if (!model) throw gatewayError(`Vision provider ${provider.id} has no configured model`, 500, "configuration_error");
  return model;
}

async function withVisionFallback({ provider, messages }) {
  if (!hasImages(messages) || provider.supportsVision) return messages;
  if (!provider.visionProvider) {
    throw gatewayError(
      `Model ${provider.id} does not support images. Configure a visionProvider for this adapter or choose a vision-capable model.`,
      400,
      "unsupported_vision",
    );
  }

  const visionSelection = resolveProviderById(provider.visionProvider);
  const { provider: visionProvider, apiKey } = visionSelection;
  if (!visionProvider.supportsVision) {
    throw gatewayError(`Configured vision provider ${visionProvider.id} is not marked as vision-capable`, 500, "configuration_error");
  }
  const describeImage = visionExecutorFor(visionProvider);
  const model = resolveVisionModel(visionProvider);
  if (!describeImage) throw gatewayError(`Vision fallback adapter is not configured for provider ${visionProvider.id}`, 500, "configuration_error");
  try {
    const converted = await convertImagesToText(messages, (image) => describeImage({ provider: visionProvider, apiKey, model, image }));
    visionSelection.markCredentialResult?.(true, 200);
    return converted;
  } catch (error) {
    visionSelection.markCredentialResult?.(false, error?.status || error?.statusCode || null);
    throw error;
  }
}

function toolShimMessages(messages, tools, toolChoice) {
  const instruction = buildToolInstruction(tools, toolChoice);
  if (!instruction) return messages;
  return [{ role: "system", content: instruction }, ...messages];
}

function usageTokens(completion) {
  const usage = completion?.usage || {};
  return Number(usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) || 0);
}

function recordUsage({ provider, model, completion, startedAt, success, error = null }) {
  const usage = completion?.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const costUsd = provider.costInputPerMillion != null || provider.costOutputPerMillion != null
    ? (inputTokens / 1000000) * Number(provider.costInputPerMillion || 0) + (outputTokens / 1000000) * Number(provider.costOutputPerMillion || 0)
    : 0;
  usageStore.record({
    provider: provider.id,
    model: `${provider.id}/${model}`,
    tokens: usageTokens(completion),
    inputTokens,
    outputTokens,
    costUsd,
    duration: Date.now() - startedAt,
    success,
    error,
  });
}

function shouldUseProviderFallback(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function fallbackSelections(initial, requestedModel) {
  const ids = Array.isArray(initial?.provider?.fallbackProviders) ? initial.provider.fallbackProviders : [];
  const requested = String(requestedModel || "").trim();
  const requestedModelId = requested.includes("/") ? requested.slice(requested.indexOf("/") + 1) : requested;
  const seen = new Set([initial.provider.id]);
  const selections = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const candidate = resolveProviderById(id);
      const model = candidate.provider.models.includes(requestedModelId)
        ? requestedModelId
        : candidate.provider.defaultModel || candidate.provider.models[0];
      if (model) selections.push({ ...candidate, model });
    } catch {
      // Disabled, expired, unavailable, or uncredentialed fallback providers are skipped.
    }
  }
  return selections;
}

async function executeSelection(selection, body, startedAt) {
  const { provider, model, apiKey } = selection;
  const messages = await withVisionFallback({ provider, messages: body.messages });

  if (Array.isArray(body.tools) && body.tools.length > 0 && !provider.supportsTools) {
    const shimmedMessages = toolShimMessages(messages, body.tools, body.tool_choice);
    const direct = await executorFor(provider)({ provider, apiKey, body: { ...body, tools: undefined }, model, messages: shimmedMessages, tools: [] });
    const answer = direct.completion?.choices?.[0]?.message?.content;
    const completion = parseClientManagedToolResponse({ text: answer, tools: body.tools, model: `${provider.id}/${model}` });
    completion.usage = direct.completion?.usage || completion.usage;
    selection.markCredentialResult?.(true, 200);
    recordUsage({ provider, model, completion, startedAt, success: true });
    return { completion, provider, model, mode: "client_managed_tools" };
  }

  const result = await executorFor(provider)({ provider, apiKey, body, model, messages, tools: body.tools || [] });
  selection.markCredentialResult?.(true, 200);
  recordUsage({ provider, model, completion: result.completion, startedAt, success: true });
  return { completion: result.completion, provider, model, mode: provider.supportsTools ? "native_tools" : "chat" };
}

export async function executeGatewayChat(body) {
  const startedAt = Date.now();
  let selection;
  let lastError;
  try {
    selection = resolveProvider(body.model);
    const candidates = [selection, ...fallbackSelections(selection, body.model)];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        return await executeSelection(candidate, body, startedAt);
      } catch (error) {
        candidate.markCredentialResult?.(false, error?.status || error?.statusCode || null);
        recordUsage({ provider: candidate.provider, model: candidate.model, completion: null, startedAt, success: false, error: error.message });
        lastError = error;
        if (index === candidates.length - 1 || !shouldUseProviderFallback(error)) throw error;
      }
    }
    throw lastError || gatewayError("All configured provider routes failed", 502, "upstream_error");
  } catch (error) {
    throw error;
  }
}

export function getGatewayDiagnostics() {
  const providers = getGatewayProviders();
  return {
    providers: providers.map(({ apiKeyEnv, headers, ...provider }) => ({
      ...provider,
      configured: Boolean(process.env[apiKeyEnv]),
      modelsConfigured: provider.models.length,
      defaultModel: provider.defaultModel || null,
    })),
    controls: {
      thirdPartyInterception: false,
      cookieToApiConversion: false,
      arbitraryToolExecution: false,
      remoteImageFetch: false,
    },
  };
}

export const __testables = { toolShimMessages, usageTokens, messageText };
