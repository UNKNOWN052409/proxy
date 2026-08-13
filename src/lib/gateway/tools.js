import { createChatCompletion, gatewayError, messageText } from "./openai.js";

const MAX_TOOLS = 32;
const MAX_TOOL_SCHEMA_BYTES = 48 * 1024;

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  if (tools.length > MAX_TOOLS) throw gatewayError(`At most ${MAX_TOOLS} tools can be declared`);

  return tools.map((tool) => {
    if (!tool || tool.type !== "function" || !tool.function || typeof tool.function.name !== "string") {
      throw gatewayError("Each tool must be an OpenAI function tool with a name");
    }
    const name = tool.function.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)) {
      throw gatewayError(`Tool name ${name || "(empty)"} is invalid`);
    }
    const parameters = tool.function.parameters || { type: "object", properties: {} };
    if (Buffer.byteLength(safeJson(parameters), "utf8") > MAX_TOOL_SCHEMA_BYTES) {
      throw gatewayError(`Tool schema for ${name} is too large`);
    }
    const permissions = Array.isArray(tool.function.permissions) ? tool.function.permissions.map((item) => String(item).slice(0, 80)).slice(0, 16) : [];
    return {
      type: "function",
      function: {
        name,
        description: String(tool.function.description || "").slice(0, 4000),
        parameters,
        permissions,
      },
    };
  });
}

export function buildToolInstruction(tools, toolChoice) {
  const normalized = normalizeTools(tools);
  if (normalized.length === 0 || toolChoice === "none") return null;

  return [
    "You are operating in a client-managed tool protocol.",
    "Do not claim to have executed a tool. Decide whether the user request needs one of the allowed tools.",
    "Respond with exactly one compact JSON object and no Markdown fences.",
    "If a tool is needed, use: {\"tool_calls\":[{\"name\":\"tool_name\",\"arguments\":{}}],\"content\":null}.",
    "If no tool is needed, use: {\"tool_calls\":[],\"content\":\"your normal answer\"}.",
    "Arguments must match the supplied JSON Schema. Do not invent tools or extra fields.",
    `Allowed tools: ${JSON.stringify(normalized.map((tool) => tool.function))}`,
    toolChoice && typeof toolChoice === "object" ? `The caller requested this tool: ${safeJson(toolChoice)}` : "",
  ].filter(Boolean).join("\n");
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
    }
  }
  return null;
}

function parseArguments(raw, name) {
  if (raw === undefined || raw === null) return "{}";
  if (typeof raw === "string") {
    try { JSON.parse(raw); return raw; } catch { throw gatewayError(`Tool ${name} returned invalid JSON arguments`, 502, "upstream_error"); }
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  throw gatewayError(`Tool ${name} returned invalid arguments`, 502, "upstream_error");
}

function validateToolChoice(toolChoice, allowed) {
  if (!toolChoice || toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return;
  const name = toolChoice?.function?.name;
  if (typeof name !== "string" || !allowed.has(name)) throw gatewayError("tool_choice references an undeclared tool", 400, "invalid_request_error");
}

function validateToolResultMessages(messages, calls = new Set()) {
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "tool") continue;
    const id = String(message.tool_call_id || "");
    if (!id || calls.size === 0 || !calls.has(id)) throw gatewayError("Tool result references an unknown tool_call_id", 400, "invalid_request_error");
    if (typeof message.content !== "string" && !Array.isArray(message.content)) throw gatewayError("Tool result content must be text or content parts", 400, "invalid_request_error");
  }
}

export function normalizeNativeToolRequest({ messages, tools, toolChoice, parallelToolCalls = true, permissions = {} }) {
  const normalized = normalizeTools(tools);
  const allowed = new Map(normalized.map((tool) => [tool.function.name, tool.function]));
  validateToolChoice(toolChoice, allowed);
  const calls = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    for (const call of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
      if (!allowed.has(call?.function?.name)) throw gatewayError("Assistant requested an undeclared tool", 400, "invalid_request_error");
      if (call.id) calls.add(String(call.id));
    }
  }
  validateToolResultMessages(messages, calls);
  const permitted = Object.fromEntries(Object.entries(permissions || {}).filter(([name, value]) => allowed.has(name) && value !== false));
  return { tools: normalized, tool_choice: toolChoice, parallel_tool_calls: parallelToolCalls !== false, permissions: permitted };
}

export function normalizeNativeToolCompletion({ completion, tools, model, parallelToolCalls = true }) {
  const normalized = normalizeTools(tools);
  const allowed = new Map(normalized.map((tool) => [tool.function.name, tool.function]));
  const choice = completion?.choices?.[0];
  const message = choice?.message || {};
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, parallelToolCalls === false ? 1 : MAX_TOOLS) : [];
  const toolCalls = calls.map((call, index) => {
    const name = String(call?.function?.name || "");
    if (!allowed.has(name)) throw gatewayError(`Model requested an undeclared tool: ${name || "(empty)"}`, 502, "upstream_error");
    const id = String(call.id || `call_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
    return { id, type: "function", function: { name, arguments: parseArguments(call?.function?.arguments, name) } };
  });
  return createChatCompletion({ model, content: toolCalls.length ? null : message.content ?? "", toolCalls, finishReason: toolCalls.length ? "tool_calls" : (choice.finish_reason || "stop"), usage: completion?.usage });
}

export function parseClientManagedToolResponse({ text, tools, model }) {
  const normalized = normalizeTools(tools);
  const response = extractJsonObject(text);
  if (!response || !Array.isArray(response.tool_calls)) {
    return createChatCompletion({ model, content: String(text || "") });
  }

  const allowed = new Map(normalized.map((tool) => [tool.function.name, tool.function]));
  const toolCalls = response.tool_calls.slice(0, MAX_TOOLS).map((call) => {
    const name = String(call?.name || "");
    if (!allowed.has(name)) throw gatewayError(`Model requested a tool that was not declared: ${name || "(empty)"}`, 502, "upstream_error");
    return {
      id: `call_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      type: "function",
      function: { name, arguments: parseArguments(call.arguments, name) },
    };
  });

  return createChatCompletion({
    model,
    content: toolCalls.length > 0 ? null : messageText(response.content),
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
  });
}

export function toAnthropicTools(tools) {
  return normalizeTools(tools).map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

export const __testables = { normalizeTools, extractJsonObject, validateToolChoice, validateToolResultMessages };
