/**
 * Hugging Face Inference API MITM adapter
 * FREE TIER - Optional token authentication
 */

import { log } from "../logger.js";

/**
 * Convert request to Hugging Face format
 */
function convertToHuggingFaceRequest(body) {
  return {
    model: body.model || "meta-llama/Llama-3.2-3B-Instruct",
    messages: body.messages || [],
    stream: body.stream ?? false,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
  };
}

/**
 * Convert Hugging Face response to OpenAI format
 */
function convertHuggingFaceToOpenAI(hfResponse, model, isStreaming = false) {
  if (isStreaming) {
    // HF streaming: { token: { text }, generated_text }
    if (hfResponse.token) {
      return {
        id: `hf-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          delta: {
            content: hfResponse.token.text || "",
          },
          finish_reason: hfResponse.generated_text ? "stop" : null,
        }],
      };
    }
    return null;
  }

  // Non-streaming response
  // HF returns array of choices
  const firstChoice = Array.isArray(hfResponse) ? hfResponse[0] : hfResponse;
  const message = firstChoice?.generated_text || firstChoice?.message?.content || "";

  return {
    id: `hf-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: message,
      },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Main intercept handler for Hugging Face
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertToHuggingFaceRequest(body);

    log(`[HuggingFace] Intercepting request for model ${convertedBody.model}`);

    // Token is optional - HF has rate-limited free tier
    const token = req.headers["x-api-key"] ||
                  req.headers["authorization"]?.replace("Bearer ", "") ||
                  process.env.HUGGINGFACE_TOKEN;

    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      log(`[HuggingFace] Using authenticated token`);
    } else {
      log(`[HuggingFace] Using free tier (rate limited)`);
    }

    // Forward to Hugging Face Inference API
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${convertedBody.model}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          inputs: convertedBody.messages.map(m => m.content).join("\n"),
          parameters: {
            temperature: convertedBody.temperature,
            max_new_tokens: convertedBody.max_tokens,
            top_p: convertedBody.top_p,
            return_full_text: false,
          },
          options: {
            use_cache: true,
            wait_for_model: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log(`[HuggingFace] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: `HuggingFace error: ${errorText}`,
          type: "huggingface_error",
        },
      }));
      return;
    }

    // HF Inference API doesn't support streaming in OpenAI format
    // Always return non-streaming
    const json = await response.json();
    const converted = convertHuggingFaceToOpenAI(json, convertedBody.model, false);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(converted));

  } catch (error) {
    log(`[HuggingFace] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "HuggingFace proxy error",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
