const encoder = new TextEncoder();

export function gatewayError(message, status = 400, type = "invalid_request_error", code = null) {
  const error = new Error(message);
  error.status = status;
  error.type = type;
  error.code = code;
  return error;
}

export function openAiErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return Response.json({
    error: {
      message: error?.message || "Gateway request failed",
      type: error?.type || "gateway_error",
      ...(error?.code ? { code: error.code } : {}),
    },
  }, { status, headers: corsHeaders() });
}

export function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": process.env.GATEWAY_CORS_ORIGIN || "http://localhost:2018",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  };
}

export function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

export function validateChatRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw gatewayError("Request body must be a JSON object");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw gatewayError("messages must be a non-empty array");
  }
  if (body.tools !== undefined && !Array.isArray(body.tools)) {
    throw gatewayError("tools must be an array when supplied");
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    throw gatewayError("stream must be a boolean when supplied");
  }
  return body;
}

export function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text")
    .map((part) => String(part.text || ""))
    .join("\n");
}

export function hasImages(messages) {
  return messages.some((message) => Array.isArray(message?.content) && message.content.some((part) => part?.type === "image_url"));
}

export function createChatCompletion({ model, content = null, toolCalls = [], finishReason = "stop", usage = null }) {
  const message = { role: "assistant", content };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  return {
    id: `chatcmpl-gw-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function createSingleSseResponse(completion) {
  const id = completion.id;
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: completion.created,
    model: completion.model,
    choices: [{
      index: 0,
      delta: completion.choices[0].message,
      finish_reason: null,
    }],
  };
  const final = {
    id,
    object: "chat.completion.chunk",
    created: completion.created,
    model: completion.model,
    choices: [{ index: 0, delta: {}, finish_reason: completion.choices[0].finish_reason }],
    usage: completion.usage,
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(final)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: corsHeaders({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }),
  });
}

export const __testables = { messageText };
