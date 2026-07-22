/**
 * Mistral API MITM adapter
 * Intercepts Mistral API requests and converts to OpenAI format
 */

import { log } from "../logger.js";

/**
 * Convert Mistral request to OpenAI format
 * Mistral uses OpenAI-compatible format
 */
function convertMistralRequest(body) {
  return {
    model: body.model || "mistral-large-latest",
    messages: body.messages || [],
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.top_p,
    stop: body.stop,
    // Mistral-specific fields
    random_seed: body.random_seed,
    safe_prompt: body.safe_prompt,
    response_format: body.response_format,
  };
}

/**
 * Convert Mistral SSE response to OpenAI format
 */
function convertMistralToOpenAI(chunk) {
  try {
    // Mistral uses OpenAI format, ensure consistent structure
    if (chunk.choices && chunk.choices[0]) {
      const choice = chunk.choices[0];
      return {
        id: chunk.id,
        object: chunk.object || "chat.completion.chunk",
        created: chunk.created || Math.floor(Date.now() / 1000),
        model: chunk.model,
        choices: [{
          index: choice.index || 0,
          delta: choice.delta || {},
          finish_reason: choice.finish_reason || null,
        }],
        usage: chunk.usage || null,
      };
    }
    return chunk;
  } catch (error) {
    log(`[Mistral] Error converting response: ${error.message}`);
    return chunk;
  }
}

/**
 * Main intercept handler for Mistral API
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertMistralRequest(body);

    log(`[Mistral] Intercepting request for model ${convertedBody.model}`);

    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");

    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "No API key provided for Mistral",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Forward to Mistral API
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[Mistral] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(errorText);
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
            const data = line.slice(6);
            if (data === "[DONE]") {
              res.write("data: [DONE]\n\n");
              continue;
            }

            try {
              const json = JSON.parse(data);
              const converted = convertMistralToOpenAI(json);
              res.write(`data: ${JSON.stringify(converted)}\n\n`);
            } catch (e) {
              res.write(line + "\n\n");
            }
          }
        }
      }

      res.end();
    } else {
      // Non-streaming response
      const json = await response.json();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    }
  } catch (error) {
    log(`[Mistral] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Internal proxy error",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
