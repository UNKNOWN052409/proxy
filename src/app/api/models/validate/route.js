/**
 * Model Validation Endpoint
 * Tests if models are actually available from providers
 */

import { NextResponse } from "next/server";

/**
 * Test model availability
 */
async function validateModel(provider, model, config = {}) {
  const validators = {
    ollama: async (model) => {
      try {
        const url = process.env.OLLAMA_URL || "http://localhost:11434";
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return { available: false, error: "Ollama not running" };
        const data = await res.json();
        const found = data.models?.some(m => m.name === model);
        return { available: found, error: found ? null : "Model not found" };
      } catch (e) {
        return { available: false, error: e.message };
      }
    },

    lmstudio: async (model) => {
      try {
        const url = process.env.LMSTUDIO_URL || "http://localhost:1234";
        const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return { available: false, error: "LM Studio not running" };
        const data = await res.json();
        const found = data.data?.some(m => m.id === model);
        return { available: found, error: found ? null : "Model not loaded" };
      } catch (e) {
        return { available: false, error: e.message };
      }
    },

    huggingface: async (model) => {
      try {
        const token = config.token || process.env.HUGGINGFACE_TOKEN;
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const res = await fetch(`https://huggingface.co/api/models/${model}`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        return { available: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (e) {
        return { available: false, error: e.message };
      }
    },

    // Default validator for API-based providers
    default: async () => {
      return { available: true, error: null, note: "API key required for actual validation" };
    },
  };

  const validator = validators[provider] || validators.default;
  return validator(model, config);
}

export async function POST(req) {
  try {
    const { provider, model, config } = await req.json();

    if (!provider || !model) {
      return NextResponse.json(
        { error: "provider and model are required" },
        { status: 400 }
      );
    }

    const result = await validateModel(provider, model, config || {});

    return NextResponse.json({
      provider,
      model,
      ...result,
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
  return NextResponse.json({
    message: "Model Validation API",
    usage: "POST with { provider, model, config? }",
    supported_providers: ["ollama", "lmstudio", "huggingface"],
  });
}
