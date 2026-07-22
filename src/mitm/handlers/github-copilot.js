/**
 * GitHub Copilot MITM adapter
 * OAuth + MITM - Uses GitHub authentication
 */

import { log } from "../logger.js";

/**
 * Convert request to GitHub Copilot format
 */
function convertToGitHubCopilotRequest(body) {
  return {
    messages: body.messages || [],
    model: body.model || "gpt-4",
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    top_p: body.top_p,
  };
}

/**
 * Convert GitHub Copilot response to OpenAI format
 */
function convertGitHubCopilotToOpenAI(copilotResponse) {
  // GitHub Copilot uses OpenAI-compatible format
  // Minimal conversion needed
  return {
    id: copilotResponse.id || `ghc-${Date.now()}`,
    object: copilotResponse.object || "chat.completion",
    created: copilotResponse.created || Math.floor(Date.now() / 1000),
    model: copilotResponse.model || "gpt-4",
    choices: copilotResponse.choices || [],
    usage: copilotResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Main intercept handler for GitHub Copilot
 */
export async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const body = JSON.parse(bodyBuffer.toString());
    const convertedBody = convertToGitHubCopilotRequest(body);

    log(`[GitHubCopilot] Intercepting request for model ${convertedBody.model}`);

    // GitHub Copilot token from environment or request headers
    const token = req.headers["x-github-token"] ||
                  req.headers["authorization"]?.replace("Bearer ", "") ||
                  process.env.GITHUB_COPILOT_TOKEN;

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "GitHub Copilot token required. Set GITHUB_COPILOT_TOKEN or pass X-GitHub-Token header.",
          type: "authentication_error",
        },
      }));
      return;
    }

    // Forward to GitHub Copilot API
    const response = await fetch("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Editor-Version": "vscode/1.85.0",
        "Editor-Plugin-Version": "copilot-chat/0.11.1",
        "User-Agent": "GitHubCopilotChat/0.11.1",
      },
      body: JSON.stringify(convertedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`[GitHubCopilot] API error: ${response.status} - ${errorText}`);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: `GitHub Copilot error: ${errorText}`,
          type: "github_copilot_error",
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
            const data = line.slice(6);
            if (data === "[DONE]") {
              res.write("data: [DONE]\n\n");
              continue;
            }

            try {
              const json = JSON.parse(data);
              res.write(`data: ${JSON.stringify(json)}\n\n`);
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
      const converted = convertGitHubCopilotToOpenAI(json);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(converted));
    }
  } catch (error) {
    log(`[GitHubCopilot] Handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: "GitHub Copilot proxy error",
          type: "proxy_error",
        },
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
