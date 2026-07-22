/**
 * MITM handler for Cursor API
 * Intercepts Cursor IDE API requests and routes through unified system
 */

import { fetchRouter, pipeSSE } from "./base.js";
import { err } from "../logger.js";

/**
 * Intercept Cursor API request
 * Cursor uses OpenAI-compatible format with custom headers
 */
async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());

    // Cursor-specific request body
    const openaiBody = {
      model: mappedModel,
      messages: body.messages || [],
      stream: body.stream !== false,
      max_tokens: body.maxTokens || body.max_tokens,
      temperature: body.temperature ?? 0.7,
      top_p: body.topP || body.top_p,
      // Cursor-specific fields
      includeAIBlock: body.includeAIBlock,
      cursorContext: body.cursorContext,
      workspaceContext: body.workspaceContext,
    };

    // Forward to router with Cursor headers
    const headers = {
      ...req.headers,
      "X-Cursor-Client-Version": req.headers["x-cursor-client-version"] || "0.42.0",
      "X-Cursor-IDE": req.headers["x-cursor-ide"] || "cursor",
    };

    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", headers);

    // Stream response (OpenAI-compatible)
    await pipeSSE(routerRes, res);
  } catch (error) {
    err(`[Cursor MITM] Request processing failed: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({
      error: {
        message: error.message,
        type: "mitm_error",
        handler: "cursor",
      },
    }));
  }
}

export { intercept };
