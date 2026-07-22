/**
 * Perplexity API MITM adapter
 * Intercepts Perplexity API requests and converts to OpenAI format
 */

import { log } from "../logger.js";

/**
 * Convert Perplexity request to OpenAI format
 * Perplexity uses OpenAI-compatible format with some extensions
 */
function convertPerplexityRequest(body) {
  return {
    model: body.model || "llama-3.1-sonar-large-128k-online",
    messages: body.messages || [],
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.top_p,
    top_k: body.top_k,
    presence_penalty: body.presence_penalty,
    frequency_penalty: body.frequency_penalty,
    // Perplexity-specific fields
    search_domain_filter: body.search_domain_filter,
    return_images: body.return_images,
    return_related_questions: body.return_related_questions,
    search_recency_filter: body.search_recency_filter,
  };
}

/**
 * Convert Perplexity SSE response to OpenAI format
 */
function convertPerplexityToOpenAI(chunk) {
  try {
    // Perplexity uses OpenAI format with additional fields
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
        // Keep Perplexity-specific fields if present
        citations: chunk.citations || null,
        usage: chunk.usage || null,
      };
    }
    return chunk;
  } catch (error) {
    log(`[Perplexity] Error converting response: ${error.message}`);
    return chunk;
  }
}

/**
 * Main intercept handler for Perplexity API
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertPerplexityRequest(body);

    log(`[Perplexity] Intercepting request for model ${convertedBody.model}`);

    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");

    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "No API key provided for Perplexity",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Forward to Perplexity API
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[Perplexity] API error: ${response.status} - ${errorText}`);
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
              const converted = convertPerplexityToOpenAI(json);
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
    log(`[Perplexity] Handler error: ${error.message}`);
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
