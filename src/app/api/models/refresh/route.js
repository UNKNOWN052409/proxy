/**
 * Auto-refresh models from all configured providers
 * Dynamically fetches from provider APIs with error handling
 */

import { providerPricing } from "@/lib/providers/pricing.js";
import { NextResponse } from "next/server";

/**
 * Fetch models dynamically from provider APIs
 * Handles wrong model IDs and API errors gracefully
 */
const modelFetchers = {
  // OAuth + MITM providers
  huggingface: async () => {
    try {
      // Fetch popular models from HF Inference API
      const token = process.env.HUGGINGFACE_TOKEN;
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};

      const response = await fetch("https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&limit=20", {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HF API error: ${response.status}`);
      }

      const models = await response.json();
      return models.slice(0, 10).map(m => ({
        id: m.id || m.modelId,
        owned_by: "huggingface",
        context_length: 8000, // Default, varies by model
      }));
    } catch (error) {
      // Fallback to known working models
      return [
        { id: "meta-llama/Llama-3.2-3B-Instruct", owned_by: "huggingface", context_length: 8000 },
        { id: "mistralai/Mistral-7B-Instruct-v0.2", owned_by: "huggingface", context_length: 8000 },
      ];
    }
  },

  "github-copilot": async () => {
    // GitHub Copilot models are fixed
    return [
      { id: "gpt-4", owned_by: "github-copilot", context_length: 128000 },
      { id: "gpt-3.5-turbo", owned_by: "github-copilot", context_length: 16385 },
    ];
  },

  // NO AUTH providers (local)
  ollama: async () => {
    try {
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000), // 2s timeout
      });

      if (!response.ok) {
        throw new Error("Ollama not running");
      }

      const data = await response.json();
      return (data.models || []).map(m => ({
        id: m.name,
        owned_by: "ollama",
        context_length: m.details?.parameter_size || 4096,
      }));
    } catch (error) {
      // Return empty if Ollama not running
      return [];
    }
  },

  lmstudio: async () => {
    try {
      const lmStudioUrl = process.env.LMSTUDIO_URL || "http://localhost:1234";
      const response = await fetch(`${lmStudioUrl}/v1/models`, {
        signal: AbortSignal.timeout(2000), // 2s timeout
      });

      if (!response.ok) {
        throw new Error("LM Studio not running");
      }

      const data = await response.json();
      return (data.data || []).map(m => ({
        id: m.id,
        owned_by: "lmstudio",
        context_length: m.context_length || 4096,
      }));
    } catch (error) {
      // Return empty if LM Studio not running
      return [];
    }
  },

  // Static providers (no API to fetch from)
  kiro: async () => {
    return [
      { id: "claude-opus-4.8", owned_by: "kiro", context_length: 200000 },
      { id: "claude-opus-4.8-thinking", owned_by: "kiro", context_length: 200000 },
      { id: "claude-sonnet-5", owned_by: "kiro", context_length: 200000 },
      { id: "claude-haiku-4.5", owned_by: "kiro", context_length: 200000 },
    ];
  },

  opencode: async () => {
    return [
      { id: "deepseek-v4", owned_by: "opencode", context_length: 128000 },
      { id: "deepseek-v4-flash", owned_by: "opencode", context_length: 128000 },
      { id: "qwen2.5-coder-32b", owned_by: "opencode", context_length: 32000 },
    ];
  },
};

export async function POST(req) {
  try {
    const { providers } = await req.json();
    const providersToRefresh = providers || Object.keys(modelFetchers);

    const allModels = [];
    const results = {};

    // Fetch models from all requested providers in parallel
    await Promise.all(
      providersToRefresh.map(async (provider) => {
        if (!modelFetchers[provider]) {
          results[provider] = { success: false, error: "Provider not supported" };
          return;
        }

        try {
          const models = await modelFetchers[provider]();
          allModels.push(...models);
          results[provider] = {
            success: true,
            count: models.length,
            models: models.map(m => m.id),
          };
        } catch (error) {
          results[provider] = {
            success: false,
            error: error.message,
            fallback: true, // Indicates fallback models were used
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      models: allModels,
      results,
      total: allModels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return list of available providers
  return NextResponse.json({
    providers: Object.keys(modelFetchers),
    count: Object.keys(modelFetchers).length,
    features: {
      dynamic: ["huggingface", "ollama", "lmstudio"],
      static: ["kiro", "opencode", "github-copilot"],
    },
  });
}

