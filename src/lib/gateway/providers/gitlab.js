import { createChatCompletion, gatewayError } from "../openai.js";

function endpoint(baseUrl) {
  return `${String(baseUrl || "").replace(/\/$/, "")}/chat/completions`;
}

function textFromMessages(messages = []) {
  return messages
    .map((message) => {
      const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content || "");
      return `${message.role || "user"}: ${content}`;
    })
    .join("\n\n")
    .slice(-120_000);
}

export async function executeGitLab({ provider, apiKey, messages, model }) {
  if (!apiKey) throw gatewayError("GitLab requires an authorized access token", 401, "missing_credentials");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(endpoint(provider.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: textFromMessages(messages), with_clean_history: true }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw gatewayError(`GitLab Duo returned HTTP ${response.status}`, response.status >= 400 && response.status < 500 ? 400 : 502, "upstream_error");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const content = typeof data === "string" ? data : data?.content || data?.message || data?.response || text;
    if (!String(content || "").trim()) throw gatewayError("GitLab Duo returned an empty response", 502, "upstream_error");
    return {
      completion: createChatCompletion({ model: `${provider.id}/${model}`, content: String(content).trim(), finishReason: "stop", usage: null }),
      usage: null,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw gatewayError("GitLab Duo request timed out", 504, "upstream_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const __testables = { textFromMessages, endpoint };
