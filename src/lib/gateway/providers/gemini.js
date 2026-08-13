import { gatewayError } from "../openai.js";

function endpoint(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/$/, "")}${path}`;
}

function safeHeaders(headers = {}) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = String(name).toLowerCase();
    if (["authorization", "x-goog-api-key", "cookie", "host", "content-length", "connection", "x-forwarded-for", "x-real-ip"].includes(normalized)) continue;
    if (typeof value === "string" && value.length <= 2048) result[name] = value;
  }
  return result;
}

function inputBlocks(body) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw gatewayError("Image prompt is required", 400, "invalid_request_error");
  if (prompt.length > 10000) throw gatewayError("Image prompt is too long", 400, "invalid_request_error");
  return [{ type: "text", text: prompt }];
}

async function postJson(url, options, timeoutMs = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || 10000)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      throw gatewayError(
        data?.error?.message || data?.error?.status || `Gemini returned HTTP ${response.status}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        "upstream_error",
        data?.error?.status || null,
      );
    }
    if (!data || typeof data !== "object") throw gatewayError("Gemini returned an invalid JSON response", 502, "upstream_error");
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw gatewayError("Gemini provider timed out", 504, "upstream_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(provider, credential) {
  const token = credential ? String(credential) : "";
  if (!token) return {};
  if (provider.authMode === "oauth" || provider.apiKeyHeader === "authorization") {
    return { Authorization: `Bearer ${token}` };
  }
  return { "x-goog-api-key": token };
}

export async function executeGeminiImage({ provider, apiKey, body, model }) {
  const input = inputBlocks(body);
  const payload = { model, input };
  if (body.aspect_ratio || body.aspectRatio) payload.generation_config = { aspect_ratio: String(body.aspect_ratio || body.aspectRatio).slice(0, 32) };
  const data = await postJson(endpoint(provider.baseUrl, "/interactions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(provider, apiKey), ...safeHeaders(provider.headers) },
    body: JSON.stringify(payload),
  });
  const output = data.output_image;
  if (!output || typeof output.data !== "string" || !output.data.trim()) {
    throw gatewayError("Gemini returned no generated image", 502, "upstream_error");
  }
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: output.data.trim() }],
  };
}

export const __testables = { inputBlocks, authHeaders, safeHeaders };
