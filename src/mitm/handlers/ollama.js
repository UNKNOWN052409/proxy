/**
 * Ollama Local MITM adapter
 * NO AUTH - runs locally, no authentication needed
 */

import { log } from "../logger.js";

/**
 * Convert Ollama request to OpenAI format
 * Ollama uses its own format, needs conversion
 */
function convertOllamaRequest(body) {
  return {
    model: body.model || "llama2",
    messages: body.messages || [],
    stream: body.stream ?? false,
    // Ollama-specific options
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
    options: body.options || {},
  };
}

/**
 * Convert Ollama response to OpenAI format
 */
function convertOllamaToOpenAI(ollamaResponse, isStreaming = false) {
  if (isStreaming) {
    // Ollama streaming format: { model, created_at, message: { role, content }, done }
    if (ollamaResponse.message) {
      return {
        id: `ollama-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: ollamaResponse.model,
        choices: [{
          index: 0,
          delta: {
            role: ollamaResponse.message.role,
            content: ollamaResponse.message.content || "",
          },
          finish_reason: ollamaResponse.done ? "stop" : null,
        }],
      };
    }
    return null;
  }

  // Non-streaming response
  return {
    id: `ollama-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: ollamaResponse.model,
    choices: [{
      index: 0,
      message: {
        role: ollamaResponse.message?.role || "assistant",
        content: ollamaResponse.message?.content || "",
      },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: ollamaResponse.prompt_eval_count || 0,
      completion_tokens: ollamaResponse.eval_count || 0,
      total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
    },
  };
}

/**
 * Main intercept handler for Ollama
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertOllamaRequest(body);

    log(`[Ollama] Intercepting request for model ${convertedBody.model}`);

    // Ollama runs locally, default to localhost:11434
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

    // Forward to Ollama API
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: convertedBody.model,
        messages: convertedBody.messages,
        stream: convertedBody.stream,
        options: convertedBody.options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[Ollama] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: `Ollama error: ${errorText}`,
          type: "ollama_error",
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
          try {
            const json = JSON.parse(line);
            const converted = convertOllamaToOpenAI(json, true);
            if (converted) {
              res.write(`data: ${JSON.stringify(converted)}\n\n`);
            }
            if (json.done) {
              res.write("data: [DONE]\n\n");
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }

      res.end();
    } else {
      // Non-streaming response
      const json = await response.json();
      const converted = convertOllamaToOpenAI(json, false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(converted));
    }
  } catch (error) {
    log(`[Ollama] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Ollama proxy error. Make sure Ollama is running locally.",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
