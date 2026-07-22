/**
 * MITM handler for OpenAI API
 * Intercepts OpenAI API requests and routes through unified system
 */

import { fetchRouter, pipeSSE } from "./base.js";
import { err } from "../logger.js";

/**
 * Intercept OpenAI API request
 * Handles both /v1/chat/completions and /v1/completions
 */
async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());

    // Detect endpoint type from original request
    const isChat = req.url.includes("/chat/completions");
    const endpoint = isChat ? "/v1/chat/completions" : "/v1/completions";

    // Prepare request body for routing
    const openaiBody = {
      model: mappedModel,
      messages: body.messages,
      prompt: body.prompt,
      stream: body.stream !== false,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      frequency_penalty: body.frequency_penalty,
      presence_penalty: body.presence_penalty,
      stop: body.stop,
      tools: body.tools,
      tool_choice: body.tool_choice,
      response_format: body.response_format,
      n: body.n,
      logprobs: body.logprobs,
      top_logprobs: body.top_logprobs,
    };

    // Forward to router
    const routerRes = await fetchRouter(openaiBody, endpoint, req.headers);

    // Stream response back (OpenAI format is passthrough)
    await pipeSSE(routerRes, res);
  } catch (error) {
    err(`[OpenAI MITM] Request processing failed: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({
      error: {
        message: error.message,
        type: "mitm_error",
        handler: "openai",
      },
    }));
  }
}

export { intercept };
