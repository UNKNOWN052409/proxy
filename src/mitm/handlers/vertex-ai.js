/**
 * Google Vertex AI MITM adapter
 * OAuth + MITM - Uses GCP authentication
 */

import { log } from "../logger.js";

/**
 * Convert request to Vertex AI format
 */
function convertToVertexRequest(body) {
  return {
    contents: body.messages?.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })) || [],
    generationConfig: {
      temperature: body.temperature,
      maxOutputTokens: body.max_tokens,
      topP: body.top_p,
      stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
    },
  };
}

/**
 * Convert Vertex AI response to OpenAI format
 */
function convertVertexToOpenAI(vertexResponse, model, isStreaming = false) {
  if (isStreaming) {
    // Vertex streaming
    if (vertexResponse.candidates && vertexResponse.candidates[0]) {
      const candidate = vertexResponse.candidates[0];
      const content = candidate.content?.parts?.[0]?.text || "";

      return {
        id: `vertex-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          delta: { content },
          finish_reason: candidate.finishReason === "STOP" ? "stop" : null,
        }],
      };
    }
    return null;
  }

  // Non-streaming
  const candidate = vertexResponse.candidates?.[0];
  const content = candidate?.content?.parts?.[0]?.text || "";

  return {
    id: `vertex-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content,
      },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: vertexResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens: vertexResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: vertexResponse.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Main intercept handler for Vertex AI
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertToVertexRequest(body);

    const model = body.model || "gemini-2.5-flash";
    log(`[VertexAI] Intercepting request for model ${model}`);

    // Vertex AI configuration
    const projectId = process.env.VERTEX_PROJECT_ID || req.headers["x-gcp-project"];
    const location = process.env.VERTEX_LOCATION || "us-central1";
    const accessToken = process.env.VERTEX_ACCESS_TOKEN ||
                       req.headers["authorization"]?.replace("Bearer ", "");

    if (!projectId || !accessToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Vertex AI requires: VERTEX_PROJECT_ID and VERTEX_ACCESS_TOKEN (or OAuth token)",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Build Vertex AI URL
    const streamSuffix = body.stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}${streamSuffix}`;

    // Forward to Vertex AI
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[VertexAI] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(errorText);
      return;
    }

    // Handle streaming response
    if (body.stream) {
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
            try {
              const json = JSON.parse(data);
              const converted = convertVertexToOpenAI(json, model, true);
              if (converted) {
                res.write(`data: ${JSON.stringify(converted)}\n\n`);
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Non-streaming response
      const json = await response.json();
      const converted = convertVertexToOpenAI(json, model, false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(converted));
    }
  } catch (error) {
    log(`[VertexAI] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Vertex AI proxy error",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
