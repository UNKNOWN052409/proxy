/**
 * MITM handler for Anthropic Claude API
 * Intercepts and converts Anthropic API requests to unified format
 */

import { fetchRouter, pipeTransformedEventStream } from "./base.js";
import { err } from "../logger.js";

/**
 * Initialize state for Anthropic response handling
 */
function initState() {
  return {
    messageId: null,
    thinking: [],
    content: [],
    toolCalls: [],
    finishReason: null,
    usage: null,
  };
}

/**
 * Convert Anthropic SSE chunk to OpenAI format
 */
function convertAnthropicToOpenAI(chunk, state) {
  if (!chunk) {
    // Flush: return final chunk if needed
    if (state.finishReason) {
      return {
        id: state.messageId || `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "claude-3-5-sonnet-20241022",
        choices: [{
          index: 0,
          delta: {},
          finish_reason: state.finishReason,
        }],
        usage: state.usage,
      };
    }
    return null;
  }

  // Parse Anthropic event
  const { type } = chunk;

  // Message start - capture ID
  if (type === "message_start") {
    state.messageId = chunk.message?.id;
    return null;
  }

  // Content block start
  if (type === "content_block_start") {
    const block = chunk.content_block;
    if (block?.type === "thinking") {
      // Start thinking block
      return null;
    }
    if (block?.type === "tool_use") {
      // Start tool call
      state.toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: "",
        },
      });
      return null;
    }
    return null;
  }

  // Content block delta
  if (type === "content_block_delta") {
    const delta = chunk.delta;

    // Thinking content
    if (delta?.type === "thinking_delta") {
      return {
        id: state.messageId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "claude-3-5-sonnet-20241022",
        choices: [{
          index: 0,
          delta: {
            reasoning_content: delta.thinking,
          },
          finish_reason: null,
        }],
      };
    }

    // Text content
    if (delta?.type === "text_delta") {
      return {
        id: state.messageId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "claude-3-5-sonnet-20241022",
        choices: [{
          index: 0,
          delta: {
            content: delta.text,
          },
          finish_reason: null,
        }],
      };
    }

    // Tool input delta
    if (delta?.type === "input_json_delta") {
      const lastTool = state.toolCalls[state.toolCalls.length - 1];
      if (lastTool) {
        lastTool.function.arguments += delta.partial_json;
        return {
          id: state.messageId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "claude-3-5-sonnet-20241022",
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: state.toolCalls.length - 1,
                function: {
                  arguments: delta.partial_json,
                },
              }],
            },
            finish_reason: null,
          }],
        };
      }
    }
  }

  // Message delta (metadata updates)
  if (type === "message_delta") {
    const delta = chunk.delta;
    if (delta?.stop_reason) {
      state.finishReason = delta.stop_reason === "end_turn" ? "stop" : delta.stop_reason;
    }
    if (chunk.usage) {
      state.usage = {
        prompt_tokens: chunk.usage.input_tokens || 0,
        completion_tokens: chunk.usage.output_tokens || 0,
        total_tokens: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0),
      };
    }
    return null;
  }

  return null;
}

/**
 * Intercept Anthropic API request
 */
async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());

    // Convert to OpenAI format for routing
    const openaiBody = {
      model: mappedModel,
      messages: body.messages || [],
      stream: body.stream !== false,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      tools: body.tools,
    };

    // Forward to router
    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", req.headers);

    // Stream response
    const state = initState();
    await pipeTransformedEventStream(routerRes, res, convertAnthropicToOpenAI, state);
  } catch (error) {
    err(`[Anthropic MITM] Request processing failed: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({
      error: {
        message: error.message,
        type: "mitm_error",
        handler: "anthropic",
      },
    }));
  }
}

export { intercept };
