/**
 * Cohere API MITM adapter
 * Intercepts Cohere API requests and converts to OpenAI format
 */

import { log } from "../logger.js";

/**
 * Convert Cohere request to OpenAI format
 * Cohere uses a different format, needs transformation
 */
function convertCohereRequest(body) {
  // Cohere uses "message" field instead of "messages" array
  const messages = body.messages || [
    { role: "user", content: body.message || "" }
  ];

  return {
    model: body.model || "command-r-plus",
    messages,
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.p, // Cohere uses "p" instead of "top_p"
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    stop_sequences: body.stop_sequences,
    // Cohere-specific fields
    k: body.k, // top-k sampling
    seed: body.seed,
    connectors: body.connectors, // RAG connectors
    search_queries_only: body.search_queries_only,
  };
}

/**
 * Convert Cohere response to OpenAI format
 */
function convertCohereToOpenAI(cohereResponse, isStreaming = false) {
  try {
    if (isStreaming) {
      // Cohere streaming format
      if (cohereResponse.event_type === "text-generation") {
        return {
          id: cohereResponse.response?.id || "cohere-" + Date.now(),
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: cohereResponse.response?.model || "command-r-plus",
          choices: [{
            index: 0,
            delta: { content: cohereResponse.text || "" },
            finish_reason: null,
          }],
        };
      } else if (cohereResponse.event_type === "stream-end") {
        return {
          id: cohereResponse.response?.id || "cohere-" + Date.now(),
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: cohereResponse.response?.model || "command-r-plus",
          choices: [{
            index: 0,
            delta: {},
            finish_reason: cohereResponse.finish_reason || "stop",
          }],
        };
      }
      return null; // Skip other event types
    } else {
      // Non-streaming format
      return {
        id: cohereResponse.generation_id || "cohere-" + Date.now(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: cohereResponse.model || "command-r-plus",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: cohereResponse.text || "",
          },
          finish_reason: cohereResponse.finish_reason || "stop",
        }],
        usage: cohereResponse.meta?.billed_units ? {
          prompt_tokens: cohereResponse.meta.billed_units.input_tokens || 0,
          completion_tokens: cohereResponse.meta.billed_units.output_tokens || 0,
          total_tokens: (cohereResponse.meta.billed_units.input_tokens || 0) +
                       (cohereResponse.meta.billed_units.output_tokens || 0),
        } : null,
      };
    }
  } catch (error) {
    log(`[Cohere] Error converting response: ${error.message}`);
    return cohereResponse;
  }
}

/**
 * Main intercept handler for Cohere API
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertCohereRequest(body);

    log(`[Cohere] Intercepting request for model ${convertedBody.model}`);

    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");

    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "No API key provided for Cohere",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Forward to Cohere API (using chat endpoint)
    const response = await fetch("https://api.cohere.ai/v1/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[Cohere] API error: ${response.status} - ${errorText}`);
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
          try {
            const json = JSON.parse(line);
            const converted = convertCohereToOpenAI(json, true);
            if (converted) {
              res.write(`data: ${JSON.stringify(converted)}\n\n`);
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Non-streaming response
      const json = await response.json();
      const converted = convertCohereToOpenAI(json, false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(converted));
    }
  } catch (error) {
    log(`[Cohere] Handler error: ${error.message}`);
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
