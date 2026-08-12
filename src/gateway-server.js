#!/usr/bin/env node
/**
 * Standalone gateway runtime.
 *
 * Run with: npm run gateway
 * This intentionally serves only the public gateway surface; the Next.js dashboard is optional.
 */
import http from "node:http";
import { validateKey } from "./lib/api-keys/store.js";
import { getGatewayStatus, listGatewayModels } from "./lib/gateway/config.js";
import { executeGatewayChat } from "./lib/gateway/service.js";
import { corsHeaders, getBearerToken, openAiErrorResponse, validateChatRequest, gatewayError } from "./lib/gateway/openai.js";

const port = Number(process.env.GATEWAY_PORT || 20127);
const host = process.env.GATEWAY_HOST || "127.0.0.1";
const maxBodyBytes = Number(process.env.GATEWAY_MAX_BODY_BYTES || 2 * 1024 * 1024);

function writeResponse(nodeResponse, response) {
  const headers = Object.fromEntries(response.headers.entries());
  nodeResponse.writeHead(response.status, headers);
  if (!response.body) return nodeResponse.end();
  response.arrayBuffer()
    .then((body) => nodeResponse.end(Buffer.from(body)))
    .catch(() => nodeResponse.end());
}

async function readJson(nodeRequest) {
  const chunks = [];
  let total = 0;
  for await (const chunk of nodeRequest) {
    total += chunk.length;
    if (total > maxBodyBytes) throw gatewayError(`Request body exceeds ${maxBodyBytes} bytes`, 413, "request_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw gatewayError("Request body must contain valid JSON");
  }
}

function toWebRequest(nodeRequest, body = undefined) {
  const origin = `http://${nodeRequest.headers.host || `${host}:${port}`}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return new Request(new URL(nodeRequest.url, origin), { method: nodeRequest.method, headers, body });
}

function authenticate(nodeRequest) {
  const token = getBearerToken(toWebRequest(nodeRequest));
  if (!token) throw gatewayError("Missing Bearer API key", 401, "authentication_error", "missing_api_key");
  if (!validateKey(token)) throw gatewayError("Invalid or expired API key", 401, "authentication_error", "invalid_api_key");
}

async function handle(nodeRequest) {
  const pathname = new URL(nodeRequest.url, `http://${nodeRequest.headers.host || "localhost"}`).pathname;
  if (nodeRequest.method === "OPTIONS" && ["/v1/models", "/v1/chat/completions"].includes(pathname)) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (nodeRequest.method === "GET" && pathname === "/health") {
    return Response.json({ ok: true, gateway: getGatewayStatus() }, { headers: corsHeaders() });
  }
  if (nodeRequest.method === "GET" && pathname === "/v1/models") {
    authenticate(nodeRequest);
    return Response.json({ object: "list", data: listGatewayModels() }, { headers: corsHeaders() });
  }
  if (nodeRequest.method === "POST" && pathname === "/v1/chat/completions") {
    authenticate(nodeRequest);
    const body = await readJson(nodeRequest);
    validateChatRequest(body);
    if (body.stream) throw gatewayError("Streaming is available through the dashboard route only; set stream to false for the standalone server", 400, "unsupported_feature");
    const { completion } = await executeGatewayChat(body);
    return Response.json(completion, { headers: corsHeaders() });
  }
  throw gatewayError("Route not found", 404, "invalid_request_error", "not_found");
}

const server = http.createServer(async (nodeRequest, nodeResponse) => {
  try {
    writeResponse(nodeResponse, await handle(nodeRequest));
  } catch (error) {
    writeResponse(nodeResponse, openAiErrorResponse(error));
  }
});

server.listen(port, host, () => {
  console.log(`Gateway listening at http://${host}:${port}`);
});
