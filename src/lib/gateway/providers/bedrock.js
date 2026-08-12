import crypto from "crypto";
import { createChatCompletion, gatewayError } from "../openai.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(query) {
  return [...new URLSearchParams(query)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join("&");
}

function canonicalHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => a.localeCompare(b));
}

function signRequest({ method, url, body, region, service = "bedrock", accessKeyId, secretAccessKey, sessionToken }) {
  const parsed = new URL(url);
  const payloadHash = sha256(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers = {
    host: parsed.host,
    "content-type": "application/json",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  const sortedHeaders = canonicalHeaders(headers);
  const signedHeaders = sortedHeaders.map(([key]) => key).join(";");
  const canonicalHeaderText = sortedHeaders.map(([key, value]) => `${key}:${value}\n`).join("");
  const canonicalRequest = [method, parsed.pathname, canonicalQuery(parsed.searchParams), canonicalHeaderText, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { ...headers, Authorization: authorization };
}

function contentToBedrock(content) {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];
  return content.flatMap((part) => {
    if (part?.type === "text") return [{ text: String(part.text || "") }];
    if (part?.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return [];
      return [{ image: { format: match[1].split("/")[1] || "png", source: { bytes: Buffer.from(match[2], "base64") } } }];
    }
    return [];
  });
}

function toBedrockMessages(messages) {
  const system = [];
  const converted = [];
  for (const message of messages || []) {
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    if (message.role === "system") {
      system.push(...contentToBedrock(message.content));
      continue;
    }
    if (role) converted.push({ role, content: contentToBedrock(message.content) });
  }
  return { system, messages: converted };
}

function usageFrom(data) {
  const usage = data?.usage || {};
  return {
    prompt_tokens: Number(usage.inputTokens || 0),
    completion_tokens: Number(usage.outputTokens || 0),
    total_tokens: Number(usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0)),
  };
}

export async function executeBedrock({ provider, body, model, messages }) {
  const region = provider.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const accessKeyId = process.env[provider.accessKeyEnv || "AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env[provider.secretKeyEnv || "AWS_SECRET_ACCESS_KEY"];
  const sessionToken = process.env[provider.sessionTokenEnv || "AWS_SESSION_TOKEN"];
  if (!region || !accessKeyId || !secretAccessKey) {
    throw gatewayError("AWS Bedrock requires AWS region, access key ID, and secret access key environment variables", 400, "configuration_error");
  }

  const endpoint = provider.baseUrl || `https://bedrock-runtime.${region}.amazonaws.com`;
  const url = `${endpoint.replace(/\/$/, "")}/model/${encodeURIComponent(model)}/converse`;
  const converted = toBedrockMessages(messages);
  const payload = {
    ...(converted.system.length ? { system: converted.system } : {}),
    messages: converted.messages,
    inferenceConfig: {},
  };
  if (body.temperature !== undefined) payload.inferenceConfig.temperature = body.temperature;
  if (body.top_p !== undefined) payload.inferenceConfig.topP = body.top_p;
  if (body.max_tokens !== undefined || body.max_completion_tokens !== undefined) payload.inferenceConfig.maxTokens = body.max_tokens ?? body.max_completion_tokens;
  if (body.stop) payload.inferenceConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];

  const serialized = JSON.stringify(payload);
  const response = await fetch(url, {
    method: "POST",
    headers: signRequest({ method: "POST", url, body: serialized, region, accessKeyId, secretAccessKey, sessionToken }),
    body: serialized,
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw gatewayError(data?.message || data?.errorMessage || `AWS Bedrock returned HTTP ${response.status}`, response.status >= 400 && response.status < 500 ? 400 : 502, "upstream_error");
  const content = (data?.output?.message?.content || []).filter((part) => typeof part?.text === "string").map((part) => part.text).join("");
  if (!content && !data?.output?.message?.content?.length) throw gatewayError("AWS Bedrock returned no assistant message", 502, "upstream_error");
  const usage = usageFrom(data);
  return { completion: createChatCompletion({ model: `${provider.id}/${model}`, content: content || null, finishReason: data?.stopReason || "stop", usage }), usage };
}

export async function listBedrockModels({ provider }) {
  const region = provider.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const accessKeyId = process.env[provider.accessKeyEnv || "AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env[provider.secretKeyEnv || "AWS_SECRET_ACCESS_KEY"];
  const sessionToken = process.env[provider.sessionTokenEnv || "AWS_SESSION_TOKEN"];
  if (!region || !accessKeyId || !secretAccessKey) throw new Error("AWS Bedrock requires region and official AWS credentials");
  const url = `https://bedrock.${region}.amazonaws.com/foundation-models`;
  const response = await fetch(url, { headers: signRequest({ method: "GET", url, body: "", region, service: "bedrock", accessKeyId, secretAccessKey, sessionToken }) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(data?.message || `AWS Bedrock model discovery returned HTTP ${response.status}`);
  return [...new Set((data?.modelSummaries || []).map((entry) => String(entry.modelId || "").trim()).filter(Boolean))].slice(0, 1000);
}

export const __testables = { sha256, canonicalHeaders, canonicalQuery, toBedrockMessages, usageFrom, signRequest };
