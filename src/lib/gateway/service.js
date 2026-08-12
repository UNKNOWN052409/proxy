import { getGatewayProviders, resolveProvider, resolveProviderById } from "./config.js";
import { createChatCompletion, gatewayError, hasImages, messageText } from "./openai.js";
import { buildToolInstruction, parseClientManagedToolResponse } from "./tools.js";
import { convertImagesToText } from "./vision.js";
import { executeOpenAi, describeImageWithOpenAi } from "./providers/openai.js";
import { executeAnthropic, describeImageWithAnthropic } from "./providers/anthropic.js";
import { usageStore } from "../usage/store.js";

function executorFor(provider) {
  if (provider.type === "openai") return executeOpenAi;
  if (provider.type === "anthropic") return executeAnthropic;
  throw gatewayError(`Unsupported provider type: ${provider.type}`, 400, "invalid_provider");
}

function visionExecutorFor(provider) {
  if (provider.type === "openai") return describeImageWithOpenAi;
  if (provider.type === "anthropic") return describeImageWithAnthropic;
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

  const { provider: visionProvider, apiKey } = resolveProviderById(provider.visionProvider);
  if (!visionProvider.supportsVision) {
    throw gatewayError(`Configured vision provider ${visionProvider.id} is not marked as vision-capable`, 500, "configuration_error");
  }
  const describeImage = visionExecutorFor(visionProvider);
  const model = resolveVisionModel(visionProvider);
  return convertImagesToText(messages, (image) => describeImage({ provider: visionProvider, apiKey, model, image }));
}

function toolShimMessages(messages, tools, toolChoice) {
  const instruction = buildToolInstruction(tools, toolChoice);
  if (!instruction) return messages;
  return [{ role: "system", content: instruction }, ...messages];
}

function usageTokens(completion) {
  const usage = completion?.usage;
  return Number(usage?.total_tokens || (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0) || 0);
}

function recordUsage({ provider, model, completion, startedAt, success, error = null }) {
  usageStore.record({
    provider: provider.id,
    model: `${provider.id}/${model}`,
    tokens: usageTokens(completion),
    duration: Date.now() - startedAt,
    success,
    error,
  });
}

export async function executeGatewayChat(body) {
  const startedAt = Date.now();
  let selection;
  try {
    selection = resolveProvider(body.model);
    const { provider, model, apiKey } = selection;
    const messages = await withVisionFallback({ provider, messages: body.messages });

    if (Array.isArray(body.tools) && body.tools.length > 0 && !provider.supportsTools) {
      const shimmedMessages = toolShimMessages(messages, body.tools, body.tool_choice);
      const direct = await executorFor(provider)({ provider, apiKey, body: { ...body, tools: undefined }, model, messages: shimmedMessages, tools: [] });
      const answer = direct.completion?.choices?.[0]?.message?.content;
      const completion = parseClientManagedToolResponse({ text: answer, tools: body.tools, model: `${provider.id}/${model}` });
      completion.usage = direct.completion?.usage || completion.usage;
      recordUsage({ provider, model, completion, startedAt, success: true });
      return { completion, provider, model, mode: "client_managed_tools" };
    }

    const result = await executorFor(provider)({ provider, apiKey, body, model, messages, tools: body.tools || [] });
    recordUsage({ provider, model, completion: result.completion, startedAt, success: true });
    return { completion: result.completion, provider, model, mode: provider.supportsTools ? "native_tools" : "chat" };
  } catch (error) {
    if (selection?.provider) {
      recordUsage({ provider: selection.provider, model: selection.model, completion: null, startedAt, success: false, error: error.message });
    }
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
