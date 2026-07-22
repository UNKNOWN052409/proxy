/**
 * Azure OpenAI MITM adapter
 * OAuth + MITM - Uses Microsoft Entra ID authentication
 */

import { log } from "../logger.js";

/**
 * Azure OpenAI uses OpenAI-compatible format
 * Minimal conversion needed
 */
function convertAzureRequest(body) {
  return {
    messages: body.messages || [],
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.top_p,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    stop: body.stop,
  };
}

/**
 * Main intercept handler for Azure OpenAI
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertAzureRequest(body);

    log(`[AzureOpenAI] Intercepting request for model ${body.model}`);

    // Azure OpenAI configuration
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || req.headers["x-azure-endpoint"];
    const azureApiKey = process.env.AZURE_OPENAI_KEY ||
                        req.headers["x-api-key"] ||
                        req.headers["authorization"]?.replace("Bearer ", "");
    const deploymentName = body.model || process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!azureEndpoint || !azureApiKey || !deploymentName) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Azure OpenAI requires: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and deployment name",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Build Azure OpenAI URL
    const apiVersion = "2024-02-01";
    const url = `${azureEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

    // Forward to Azure OpenAI
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": azureApiKey,
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[AzureOpenAI] API error: ${response.status} - ${errorText}`);
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
    log(`[AzureOpenAI] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "Azure OpenAI proxy error",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
