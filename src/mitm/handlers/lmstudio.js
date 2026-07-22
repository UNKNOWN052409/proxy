/**
 * LM Studio Local MITM adapter
 * NO AUTH - runs locally, no authentication needed
 */

import { log } from "../logger.js";

/**
 * LM Studio uses OpenAI-compatible API format
 * Minimal conversion needed
 */
function convertLMStudioRequest(body) {
  return {
    model: body.model || "local-model",
    messages: body.messages || [],
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.top_p,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
  };
}

/**
 * Main intercept handler for LM Studio
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertLMStudioRequest(body);

    log(`[LMStudio] Intercepting request for model ${convertedBody.model}`);

    // LM Studio runs locally, default to localhost:1234
    const lmStudioUrl = process.env.LMSTUDIO_URL || "http://localhost:1234";

    // Forward to LM Studio API (OpenAI-compatible)
    const response = await fetch(`${lmStudioUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[LMStudio] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: `LM Studio error: ${errorText}`,
          type: "lmstudio_error",
        },
      }));
      return;
    }

    // Handle streaming response
    if (convertedBody.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            res.write(line + "\n\n");
          }
        }
      }

      res.end();
    } else {
      // Non-streaming response (already OpenAI format)
      const json = await response.json();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    }
  } catch (error) {
    log(`[LMStudio] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "LM Studio proxy error. Make sure LM Studio is running.",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
