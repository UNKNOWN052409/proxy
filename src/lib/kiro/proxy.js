/**
 * Kiro AI Proxy Executor — Real AWS EventStream parser
 * 
 * Translates OpenAI-format requests to Kiro AWS CodeWhisperer streaming API
 * and transforms binary AWS EventStream responses into OpenAI-format SSE chunks.
 * 
 * Based on 9router's open-sse/executors/kiro.js (production-grade implementation).
 * 
 * Event types handled:
 *   - assistantResponseEvent  → content delta
 *   - reasoningContentEvent   → thinking/reasoning content
 *   - codeEvent               → code block deltas
 *   - toolUseEvent            → tool call invocations
 *   - messageStopEvent        → finish_reason signal
 *   - contextUsageEvent       → context usage % for token estimation
 *   - meteringEvent           → metering info (signals stream end)
 *   - metricsEvent            → precise token counts
 */

import { KIRO_CONFIG } from "./config";
import { kiroOAuth } from "./oauth";
import { accountStore } from "./store";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

// ─── Constants ───────────────────────────────────────────────
const SSE_DONE = "data: [DONE]\n\n";
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

const KIRO_RUNTIME_SDK_VERSION = "1.0.0";
const KIRO_AGENT_OS = "windows";
const KIRO_AGENT_OS_VERSION = "10.0.26200";
const KIRO_NODE_VERSION = "22.21.1";
const KIRO_VERSION = "0.10.32";

const KIRO_THINKING_BUDGET_DEFAULT = 16000;
const FETCH_TIMEOUT_MS = 15_000; // connect timeout

// Default profile ARNs (from 9router's kiroConstants.js)
// Builder ID and Google/GitHub social sign-ins map to different shared profiles.
const KIRO_DEFAULT_PROFILE_ARNS = {
  "builder-id": "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX",
  social: "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK",
};

// Agentic system prompt for chunked writes (from 9router)
const KIRO_AGENTIC_SYSTEM_PROMPT = `
# CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)

You MUST follow these rules for ALL file operations. Violation causes server timeouts and task failure.

## ABSOLUTE LIMITS
- **MAXIMUM 350 LINES** per single write/edit operation - NO EXCEPTIONS
- **RECOMMENDED 300 LINES** or less for optimal performance
- **NEVER** write entire files in one operation if >300 lines

## MANDATORY CHUNKED WRITE STRATEGY

### For NEW FILES (>300 lines total):
1. FIRST: Write initial chunk (first 250-300 lines) using write_to_file/fsWrite
2. THEN: Append remaining content in 250-300 line chunks using file append operations
3. REPEAT: Continue appending until complete

### For EDITING EXISTING FILES:
1. Use surgical edits (apply_diff/targeted edits) - change ONLY what's needed
2. NEVER rewrite entire files - use incremental modifications
3. Split large refactors into multiple small, focused edits

### For LARGE CODE GENERATION:
1. Generate in logical sections (imports, types, functions separately)
2. Write each section as a separate operation
3. Use append operations for subsequent sections

## WHY THIS MATTERS
- Server has 2-3 minute timeout for operations
- Large writes exceed timeout and FAIL completely
- Chunked writes are FASTER and more RELIABLE
- Failed writes waste time and require retry

REMEMBER: When in doubt, write LESS per operation. Multiple small operations > one large operation.
`.trim();

// ─── Fingerprint Headers (matches 9router's kiroModels.js) ──
function buildKiroFingerprintHeaders(account) {
  const seed =
    account?.providerSpecificData?.clientId ||
    account?.refreshToken ||
    account?.providerSpecificData?.profileArn ||
    account?.accessToken ||
    "kiro-anonymous";
  const machineId = createHash("sha256").update(String(seed)).digest("hex");

  const userAgent =
    `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} ua/2.1 ` +
    `os/${KIRO_AGENT_OS}#${KIRO_AGENT_OS_VERSION} ` +
    `lang/js md/nodejs#${KIRO_NODE_VERSION} ` +
    `api/codewhispererruntime#${KIRO_RUNTIME_SDK_VERSION} m/N,E ` +
    `KiroIDE-${KIRO_VERSION}-${machineId}`;
  const amzUserAgent = `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} KiroIDE-${KIRO_VERSION}-${machineId}`;

  return {
    "User-Agent": userAgent,
    "X-Amz-User-Agent": amzUserAgent,
    "x-amzn-kiro-agent-mode": "vibe",
    "x-amzn-codewhisperer-optout": "true",
    "Amz-Sdk-Request": "attempt=1; max=1",
    "Amz-Sdk-Invocation-Id": uuidv4(),
    "Content-Type": "application/json",
  };
}

// ─── Profile ARN resolution ──────────────────────────────────
function resolveProfileArn(account) {
  const psd = account?.providerSpecificData || {};
  if (psd.profileArn) return psd.profileArn;

  const authMethod = psd.authMethod || "";
  if (authMethod === "google" || authMethod === "github") {
    return KIRO_DEFAULT_PROFILE_ARNS.social;
  }
  return KIRO_DEFAULT_PROFILE_ARNS["builder-id"];
}

function regionFromProfileArn(profileArn) {
  if (!profileArn || typeof profileArn !== "string") return "us-east-1";
  const parts = profileArn.split(":");
  if (parts.length >= 4 && parts[3]) return parts[3];
  return "us-east-1";
}

// ─── Model Helpers ──────────────────────────────────────────
function isThinkingModel(model) {
  return typeof model === "string" && model.endsWith("-thinking");
}

function isAgenticModel(model) {
  return typeof model === "string" && model.endsWith("-agentic");
}

function resolveKiroModel(model) {
  let upstream = model || "";
  let agentic = false;
  let thinking = false;

  if (isAgenticModel(upstream)) {
    agentic = true;
    upstream = upstream.slice(0, -"-agentic".length);
  }
  if (isThinkingModel(upstream)) {
    thinking = true;
    upstream = upstream.slice(0, -"-thinking".length);
  }

  return { upstream, agentic, thinking };
}

function buildThinkingSystemPrefix(budget = KIRO_THINKING_BUDGET_DEFAULT) {
  const safeBudget = Math.max(1, Math.min(32000, Number(budget) || KIRO_THINKING_BUDGET_DEFAULT));
  return `<thinking_mode>enabled</thinking_mode>\n<max_thinking_length>${safeBudget}</max_thinking_length>`;
}

// ─── Kiro Payload Builder (matches 9router's Kiro executor) ──
function buildKiroPayload(openaiBody, account) {
  const modelId = openaiBody.model || "claude-sonnet-4.5";
  const { upstream: kiroModel, agentic, thinking } = resolveKiroModel(modelId);

  const messages = openaiBody.messages || [];
  const systemMessages = messages.filter(m => m.role === "system");
  const conversationMessages = messages.filter(m => m.role !== "system");

  // Build system prompt with optional prefixes
  let systemPrompt = "";
  if (thinking) {
    systemPrompt += buildThinkingSystemPrefix() + "\n\n";
  }
  if (agentic) {
    systemPrompt += KIRO_AGENTIC_SYSTEM_PROMPT + "\n\n";
  }
  const existingSystem = systemMessages.map(m =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  ).join("\n\n");
  systemPrompt += existingSystem;

  const conversation = conversationMessages.map((msg) => ({
    turnId: `turn-${Math.random().toString(36).slice(2, 10)}`,
    role: msg.role === "assistant" ? "assistant" : "user",
    content: typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(p => (typeof p === "object" ? p.text || JSON.stringify(p) : p)).join(" ")
        : JSON.stringify(msg.content),
  }));

  // Build profile ARN from account credentials
  const profileArn = resolveProfileArn(account);
  const region = regionFromProfileArn(profileArn);

  const kiroPayload = {
    conversation,
    userIntent: "chat",
    source: "CodeWhisperer",
    awsRegion: region,
    arn: profileArn,
    profileArn,
    options: {
      model: kiroModel,
      stream: openaiBody.stream !== false,
      maxTokens: openaiBody.max_tokens || 4096,
      temperature: openaiBody.temperature ?? 0.7,
      topP: openaiBody.top_p ?? 0.9,
      ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
      ...(thinking ? { reasoningConfig: { enabled: true, maxThinkingLength: KIRO_THINKING_BUDGET_DEFAULT } } : {}),
    },
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return kiroPayload;
}

// ─── AWS EventStream Binary Frame Parser ─────────────────────
function parseEventFrame(data) {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const totalLength = view.getUint32(0, false);
    if (totalLength < 16 || totalLength > data.length) return null;

    const headersLength = view.getUint32(4, false);
    const headers = {};
    let offset = 12;
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;
      const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
      offset += nameLen;
      if (offset >= data.length) break;

      const headerType = data[offset];
      offset++;
      if (headerType === 7) {
        if (offset + 2 > data.length) break;
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;
        const value = new TextDecoder().decode(data.slice(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;
    let payload = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = new TextDecoder().decode(data.slice(payloadStart, payloadEnd));
      if (payloadStr && payloadStr.trim()) {
        try { payload = JSON.parse(payloadStr); } catch { payload = { raw: payloadStr }; }
      }
    }

    return { headers, payload };
  } catch {
    return null;
  }
}

// ─── AWS EventStream → OpenAI SSE Transform ──────────────────
function createKiroSSETransform(model) {
  let buffer = new Uint8Array(0);
  let chunkIndex = 0;
  const responseId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const state = {
    finishEmitted: false,
    hasToolCalls: false,
    hasReasoningContent: false,
    reasoningChunkCount: 0,
    toolCallIndex: 0,
    seenToolIds: new Map(),
    inThinking: false,
    totalContentLength: 0,
    contextUsagePercentage: 0,
    hasMeteringEvent: false,
    hasContextUsageEvent: false,
    usage: null,
  };

  return new TransformStream({
    async transform(chunk, controller) {
      const enqueueCountBefore = chunkIndex;
      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      let iterations = 0;
      while (buffer.length >= 16 && iterations < 1000) {
        iterations++;
        const view = new DataView(buffer.buffer, buffer.byteOffset);
        const totalLength = view.getUint32(0, false);
        if (totalLength < 16 || totalLength > buffer.length || buffer.length < totalLength) break;

        const eventData = buffer.slice(0, totalLength);
        buffer = buffer.slice(totalLength);
        const event = parseEventFrame(eventData);
        if (!event) continue;

        const eventType = event.headers[":event-type"] || "";

        // ── assistantResponseEvent ──
        if (eventType === "assistantResponseEvent" && event.payload?.content) {
          let content = event.payload.content;
          if (state.inThinking) {
            if (content.includes("</thinking>")) {
              state.inThinking = false;
              const after = content.split("</thinking>").slice(1).join("</thinking>");
              content = after.startsWith("\n") ? after.substring(1) : after;
            } else { content = ""; }
          } else if (content.includes("<thinking>")) {
            if (content.includes("</thinking>")) {
              const before = content.split("<thinking>")[0];
              const after = content.split("</thinking>").slice(1).join("</thinking>");
              content = before + (after.startsWith("\n") ? after.substring(1) : after);
            } else { state.inThinking = true; content = content.split("<thinking>")[0]; }
          }
          if (!content && state.hasReasoningContent) continue;
          state.totalContentLength += content.length;
          const delta = chunkIndex === 0 ? { role: "assistant", content } : { content };
          chunkIndex++;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`));
        }

        // ── reasoningContentEvent ──
        if (eventType === "reasoningContentEvent") {
          const reasoning = event.payload?.reasoningContentEvent || event.payload || {};
          const reasoningText = typeof reasoning === "string" ? reasoning : (reasoning.text || reasoning.content || "");
          if (reasoningText) {
            state.hasReasoningContent = true;
            state.totalContentLength += reasoningText.length;
            const delta = state.reasoningChunkCount === 0 && chunkIndex === 0 ? { role: "assistant", reasoning_content: reasoningText } : { reasoning_content: reasoningText };
            chunkIndex++;
            state.reasoningChunkCount++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`));
          }
        }

        // ── codeEvent ──
        if (eventType === "codeEvent" && event.payload?.content) {
          chunkIndex++;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: event.payload.content }, finish_reason: null }] })}\n\n`));
        }

        // ── toolUseEvent ──
        if (eventType === "toolUseEvent" && event.payload) {
          state.hasToolCalls = true;
          const toolUses = Array.isArray(event.payload) ? event.payload : [event.payload];
          for (const singleToolUse of toolUses) {
            const toolCallId = singleToolUse.toolUseId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const toolName = singleToolUse.name || "";
            const toolInput = singleToolUse.input;
            const isNewTool = !state.seenToolIds.has(toolCallId);
            let toolIndex;
            if (isNewTool) {
              toolIndex = state.toolCallIndex++;
              state.seenToolIds.set(toolCallId, toolIndex);
              chunkIndex++;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { ...(chunkIndex === 0 ? { role: "assistant" } : {}), tool_calls: [{ index: toolIndex, id: toolCallId, type: "function", function: { name: toolName, arguments: "" } }] }, finish_reason: null }] })}\n\n`));
            } else {
              toolIndex = state.seenToolIds.get(toolCallId);
            }
            if (toolInput !== undefined && toolInput !== null) {
              const argsStr = typeof toolInput === "string" ? toolInput : typeof toolInput === "object" ? JSON.stringify(toolInput) : String(toolInput);
              chunkIndex++;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndex, function: { arguments: argsStr } }] }, finish_reason: null }] })}\n\n`));
            }
          }
        }

        // ── messageStopEvent ──
        if (eventType === "messageStopEvent") {
          state.finishEmitted = true;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: state.hasToolCalls ? "tool_calls" : "stop" }] })}\n\n`));
        }

        // ── contextUsageEvent ──
        if (eventType === "contextUsageEvent" && event.payload?.contextUsagePercentage) {
          state.contextUsagePercentage = event.payload.contextUsagePercentage;
          state.hasContextUsageEvent = true;
        }

        // ── meteringEvent ──
        if (eventType === "meteringEvent") state.hasMeteringEvent = true;

        // ── metricsEvent ──
        if (eventType === "metricsEvent") {
          const metrics = event.payload?.metricsEvent || event.payload;
          if (metrics && typeof metrics === "object") {
            const inputTokens = metrics.inputTokens || 0;
            const outputTokens = metrics.outputTokens || 0;
            const cachedTokens = metrics.cacheReadInputTokens || metrics.cache_read_input_tokens || 0;
            if (inputTokens > 0 || outputTokens > 0) {
              state.usage = { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens };
              if (cachedTokens > 0) state.usage.cache_read_input_tokens = cachedTokens;
            }
          }
        }

        // ── Final usage chunk after meteringEvent + contextUsageEvent ──
        if (state.hasMeteringEvent && state.hasContextUsageEvent && !state.finishEmitted) {
          state.finishEmitted = true;
          if (!state.usage) {
            const estimatedOutput = state.totalContentLength > 0 ? Math.max(1, Math.floor(state.totalContentLength / 4)) : 0;
            const estimatedInput = state.contextUsagePercentage > 0 ? Math.floor(state.contextUsagePercentage * 200000 / 100) : 0;
            state.usage = { prompt_tokens: estimatedInput, completion_tokens: estimatedOutput, total_tokens: estimatedInput + estimatedOutput };
          }
          const finalChunk = { id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: state.hasToolCalls ? "tool_calls" : "stop" }] };
          if (state.usage) finalChunk.usage = state.usage;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        }
      }

      // Keepalive
      if (chunkIndex === enqueueCountBefore && !state.finishEmitted) {
        controller.enqueue(new TextEncoder().encode(": ka\n\n"));
      }
    },
    flush(controller) {
      if (!state.finishEmitted) {
        const finalChunk = { id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: state.hasToolCalls ? "tool_calls" : "stop" }] };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
      }
      controller.enqueue(new TextEncoder().encode(SSE_DONE));
    },
  });
}

// ─── Auth-aware header builder ────────────────────────────────
function buildAuthHeaders(account) {
  const authMethod = account?.providerSpecificData?.authMethod;
  const isApiKey = authMethod === "api_key";
  const isExternalIdp = authMethod === "external_idp";
  const apiKey = account?.apiKey || (isApiKey ? account?.accessToken : null);

  const headers = { ...KIRO_CONFIG.transport.headers };

  if (isApiKey && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["tokentype"] = "API_KEY";
  } else if (account?.accessToken) {
    headers["Authorization"] = `Bearer ${account.accessToken}`;
    if (isExternalIdp) headers["TokenType"] = "EXTERNAL_IDP";
  }

  return headers;
}

// ─── Headers merge ────────────────────────────────────────────
function buildRequestHeaders(account) {
  const fpHeaders = buildKiroFingerprintHeaders(account);
  const authHeaders = buildAuthHeaders(account);
  return { ...fpHeaders, ...authHeaders };
}

// ─── Auth-aware URL ordering ──────────────────────────────────
function getOrderedUrls(account) {
  const baseUrls = [...(KIRO_CONFIG.transport.baseUrls || [KIRO_CONFIG.transport.baseUrl])];
  const authMethod = account?.providerSpecificData?.authMethod;
  const psdRegion = account?.providerSpecificData?.region;
  const profileArn = resolveProfileArn(account);
  const region = regionFromProfileArn(profileArn);

  const isCodeWhispererSurface = ["api_key", "external_idp", "idc"].includes(authMethod);
  if (!isCodeWhispererSurface) return baseUrls;

  const regionalize = (u) =>
    region && region !== "us-east-1" && u.includes("amazonaws.com")
      ? u.replace(/([a-z]+)\.[a-z0-9-]+\.amazonaws\.com/, `$1.${region}.amazonaws.com`)
      : u;

  const amazon = baseUrls.filter(u => u.includes("amazonaws.com")).map(regionalize);
  const others = baseUrls.filter(u => !u.includes("amazonaws.com"));
  return amazon.length > 0 ? [...amazon, ...others] : baseUrls;
}

// ─── Fetch with timeout ────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("fetch connect timeout")), timeoutMs);
  const mergedSignal = options.signal
    ? AbortSignal.any ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    : controller.signal;
  try {
    const response = await fetch(url, { ...options, signal: mergedSignal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Token Refresh ──────────────────────────────────────────────
/**
 * Try to refresh an expired token.
 * Returns { updatedAccount, refreshed } on success, or null on failure.
 */
async function refreshAccountToken(account) {
  if (!account?.refreshToken) return null;
  try {
    const result = await kiroOAuth.refreshToken(account.refreshToken, account.providerSpecificData);
    if (result?.accessToken) {
      // Update account in persistent store (in-place, accumulative)
      const updates = {
        accessToken: result.accessToken,
        expiresAt: new Date(Date.now() + (result.expiresIn || 3600) * 1000).toISOString(),
      };
      if (result.refreshToken) updates.refreshToken = result.refreshToken;
      if (result.profileArn) updates.providerSpecificData = { ...account.providerSpecificData, profileArn: result.profileArn };
      accountStore.update(account.id, updates);
      return { updatedAccount: { ...account, ...updates }, refreshed: true };
    }
  } catch (err) {
    // Token refresh failed — probably invalid/expired refresh token too
    return null;
  }
  return null;
}

// ─── Account Rotation ─────────────────────────────────────────
function pickAccount(accounts, model) {
  if (!accounts || accounts.length === 0) return null;
  const hash = model.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return accounts[hash % accounts.length];
}

// ─── Execute Kiro Stream (public API) ─────────────────────────
export async function executeKiroStream(openaiBody, accounts) {
  const activeAccounts = accounts.filter(a => a.active !== false);
  if (activeAccounts.length === 0) {
    return { error: { message: "No active Kiro accounts found. Import an account first.", type: "auth_error" } };
  }

  const model = openaiBody.model || "";
  let account = pickAccount(activeAccounts, model);
  let payload = buildKiroPayload(openaiBody, account);
  let urls = getOrderedUrls(account);
  let headers = buildRequestHeaders(account);
  let lastError = null;
  let refreshed = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < urls.length; i++) {
      try {
        const response = await fetchWithTimeout(urls[i], {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const ct = response.headers.get("content-type") || "";
          if (ct.includes("vnd.amazon.eventstream") || ct.includes("octet-stream")) {
            const transformStream = createKiroSSETransform(model);
            return new Response(response.body.pipeThrough(transformStream), { headers: SSE_HEADERS });
          }
          const text = await response.text();
          const safeText = text.replace(/<[^>]*>/g, "").trim().slice(0, 500);
          return new Response(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: safeText }, finish_reason: null }] })}\n\n` +
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })}\n\n` +
            SSE_DONE,
            { headers: SSE_HEADERS }
          );
        }

        // 401/403 with refresh token available → try auto-refresh once
        if ((response.status === 401 || response.status === 403) && !refreshed && account?.refreshToken) {
          const refreshedData = await refreshAccountToken(account);
          if (refreshedData) {
            account = refreshedData.updatedAccount;
            refreshed = true;
            // Rebuild request with new token and retry
            headers = buildRequestHeaders(account);
            // Need to rebuild payload because profileArn may have changed
            payload = buildKiroPayload(openaiBody, account);
            attempt = 0; // Reset attempt counter, retry with fresh token
            break;
          }
        }

        lastError = { code: response.status, type: response.status === 429 ? "rate_limit" : response.status >= 500 ? "upstream_error" : "auth_error" };
        const errorText = await response.text().catch(() => "");
        lastError.message = response.status === 429
          ? "Rate limited. Trying next account/endpoint."
          : response.status >= 500
            ? `Upstream error (${response.status}): ${errorText.slice(0, 200)}`
            : `Auth error (${response.status}): ${errorText.slice(0, 200)}`;

        // 429/5xx → try next URL; 4xx → fail fast (except 429 which is retried)
        if (response.status === 429 || response.status >= 500) continue;
        return { error: lastError, status: response.status };
      } catch (err) {
        lastError = { message: `Network error: ${err.message}`, type: "network_error" };
        continue;
      }
    }
  }

  return { error: lastError || { message: "All upstream endpoints failed", type: "proxy_error" } };
}

// ─── Execute Kiro Non-Streaming ────────────────────────────────
export async function executeKiroCompletion(openaiBody, account) {
  let currentAccount = account;
  let payload = buildKiroPayload(openaiBody, currentAccount);
  payload.options.stream = false;
  let urls = getOrderedUrls(currentAccount);
  let headers = buildRequestHeaders(currentAccount);
  let refreshed = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < urls.length; i++) {
      try {
        const response = await fetchWithTimeout(urls[i], { method: "POST", headers, body: JSON.stringify(payload) });
        if (!response.ok) {
          // 401/403 → try auto-refresh once
          if ((response.status === 401 || response.status === 403) && !refreshed && currentAccount?.refreshToken) {
            const refreshedData = await refreshAccountToken(currentAccount);
            if (refreshedData) {
              currentAccount = refreshedData.updatedAccount;
              refreshed = true;
              headers = buildRequestHeaders(currentAccount);
              payload = buildKiroPayload(openaiBody, currentAccount);
              payload.options.stream = false;
              attempt = 0;
              break;
            }
          }
          if (response.status === 429 || response.status >= 500) continue;
          const errorText = await response.text().catch(() => "");
          return { error: { message: `Kiro error (${response.status}): ${errorText.slice(0, 300)}`, code: response.status } };
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const events = [];
        let offset = 0;
        while (offset < bytes.length) {
          if (offset + 8 > bytes.length) break;
          const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
          const totalLength = view.getUint32(0, false);
          if (totalLength < 16 || totalLength > bytes.length - offset) break;
          const eventBytes = bytes.slice(offset, offset + totalLength);
          offset += totalLength;
          const ev = parseEventFrame(eventBytes);
          if (ev) events.push(ev);
        }

        let fullContent = "", reasoningContent = "", inputTokens = 0, outputTokens = 0;
        for (const ev of events) {
          const et = ev.headers[":event-type"] || "";
          if (et === "assistantResponseEvent" && ev.payload?.content) fullContent += ev.payload.content;
          if (et === "reasoningContentEvent") {
            const r = ev.payload?.reasoningContentEvent || ev.payload || {};
            reasoningContent += (r.text || r.content || "");
          }
          if (et === "metricsEvent") {
            const m = ev.payload?.metricsEvent || ev.payload || {};
            inputTokens = m.inputTokens || 0; outputTokens = m.outputTokens || 0;
          }
        }

        return {
          id: `chatcmpl-${uuidv4()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: openaiBody.model,
          choices: [{ index: 0, message: { role: "assistant", content: fullContent, ...(reasoningContent ? { reasoning_content: reasoningContent } : {}) }, finish_reason: "stop" }],
          usage: { prompt_tokens: inputTokens || Math.floor(fullContent.length / 4), completion_tokens: outputTokens || Math.max(1, Math.floor(fullContent.length / 2)), total_tokens: (inputTokens || Math.floor(fullContent.length / 4)) + (outputTokens || Math.max(1, Math.floor(fullContent.length / 2))) },
        };
      } catch (err) { continue; }
    }
  }
  return { error: { message: "All upstream endpoints failed", type: "proxy_error" } };
}
