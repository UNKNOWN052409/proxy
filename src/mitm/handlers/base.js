// src/mitm/handlers/base.js
import { MITM_CONFIG } from "../config.js";
import { log, err } from "../logger.js";

const ROUTER_BASE = String(MITM_CONFIG.ROUTER_BASE)
  .trim()
  .replace(/\/+$/, "") || "http://localhost:2018";
const API_KEY = MITM_CONFIG.API_KEY;

// Headers that must not be forwarded to the main router
const STRIP_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "content-type", "authorization"
]);

/**
 * Send body to the main router at the given path and return the fetch Response object.
 * Optionally forwards client headers (stripped of hop-by-hop / overridden keys).
 *
 * @param {object} openaiBody - OpenAI-format request body
 * @param {string} path - API path (default: "/v1/chat/completions")
 * @param {object} clientHeaders - Client headers to forward
 * @returns {Promise<Response>} Fetch Response object
 */
async function fetchRouter(openaiBody, path = "/v1/chat/completions", clientHeaders = {}) {
  const forwarded = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      // Strip control characters from header values
      forwarded[k] = typeof v === 'string' ? v.replace(/[\x00-\x1F\x7F]/g, '') : v;
    }
  }

  try {
    const response = await fetch(`${ROUTER_BASE}${path}`, {
      method: "POST",
      headers: {
        ...forwarded,
        "Content-Type": "application/json",
        ...(API_KEY && { "Authorization": `Bearer ${API_KEY}` })
      },
      body: JSON.stringify(openaiBody),
      signal: AbortSignal.timeout(30000)
    });

    return response;
  } catch (error) {
    err(`fetchRouter error: ${error.message}`);
    throw error;
  }
}

/**
 * Pipe SSE stream from router directly to client response.
 * Optional dumper tees the stream into a debug file.
 *
 * @param {Response} routerRes - Fetch Response from the main router
 * @param {http.ServerResponse} res - Client response
 * @param {object} dumper - Optional dumper for debugging
 */
async function pipeSSE(routerRes, res, dumper) {
  const ct = routerRes.headers.get("content-type") || "application/json";
  const status = routerRes.status || 200;
  const resHeaders = { "Content-Type": ct, "Cache-Control": "no-cache", "Connection": "keep-alive" };
  if (ct.includes("text/event-stream")) resHeaders["X-Accel-Buffering"] = "no";
  res.writeHead(status, resHeaders);
  if (dumper) dumper.writeHeader(routerRes.status, Object.fromEntries(routerRes.headers));

  if (!routerRes.body) {
    const text = await routerRes.text().catch(() => "");
    if (dumper) { dumper.writeChunk(text); dumper.end(); }
    res.end(text);
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder();
  let clientDisconnected = false;

  // Cancel reader if client disconnects
  res.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done) { if (dumper) dumper.end(); res.end(); break; }
      if (dumper) dumper.writeChunk(value);
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    err(`pipeSSE error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    if (res.writable && !res.writableEnded) {
      res.end(JSON.stringify({ error: "Stream error" }));
    }
  } finally {
    // Ensure reader is cleaned up
    reader.cancel().catch(() => {});
  }
}

/**
 * Pipe SSE stream from router, transforming each chunk through a user function.
 * Reads SSE data: lines, parses JSON, calls transformFn(parsed, state),
 * and writes returned SSE strings to the client response.
 *
 * @param {Response} routerRes - Fetch Response from the main router
 * @param {http.ServerResponse} res - Client response
 * @param {Function} transformFn - (parsedChunk, state) => string|string[]|null
 * @param {object} state - Mutable state object shared across chunks and flush
 */
async function pipeTransformedSSE(routerRes, res, transformFn, state) {
  const ct = routerRes.headers.get("content-type") || "application/json";
  const resHeaders = { "Content-Type": ct, "Cache-Control": "no-cache", "Connection": "keep-alive" };
  if (ct.includes("text/event-stream")) resHeaders["X-Accel-Buffering"] = "no";
  res.writeHead(200, resHeaders);

  if (!routerRes.body) {
    res.end(await routerRes.text().catch(() => ""));
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB limit
  let buffer = "";
  let clientDisconnected = false;

  // Cancel reader if client disconnects
  res.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Check buffer size limit
      if (buffer.length > MAX_BUFFER_SIZE) {
        throw new Error(`Buffer overflow: exceeded ${MAX_BUFFER_SIZE} bytes`);
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        if (process.env.DEBUG_MITM) {
          log(`[SSE in] ${data.slice(0, 200)}`);
        }

        try {
          const parsed = JSON.parse(data);
          const result = transformFn(parsed, state);
          if (result != null) {
            const outputs = Array.isArray(result) ? result : [result];
            for (const output of outputs) {
              if (process.env.DEBUG_MITM) {
                const len = output.length || output.byteLength || 0;
                log(`[write frame] (${len}B)`);
              }
              res.write(Buffer.from(output));
            }
          }
        } catch (parseError) {
          // Skip unparseable lines
          if (process.env.DEBUG_MITM) {
            log(`[SSE parse error] ${parseError.message}`);
          }
        }
      }
    }

    // Flush: pass null to signal stream end
    try {
      const flushed = transformFn(null, state);
      if (flushed != null) {
        const outputs = Array.isArray(flushed) ? flushed : [flushed];
        for (const output of outputs) {
          res.write(Buffer.from(output));
        }
      }
    } catch (flushError) {
      if (process.env.DEBUG_MITM) {
        log(`[SSE flush error] ${flushError.message}`);
      }
    }

    res.end();
  } catch (error) {
    err(`pipeTransformedSSE error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    if (res.writable && !res.writableEnded) {
      res.end(JSON.stringify({ error: "Stream transformation error" }));
    }
  } finally {
    // Ensure reader is cleaned up
    reader.cancel().catch(() => {});
  }
}

/**
 * Pipe SSE stream from router, transforming each chunk through a user function,
 * and writing binary EventStream frames to the client.
 *
 * Reads SSE data: lines, parses JSON, calls transformFn(parsed, state),
 * and writes returned Uint8Array frames to the client response.
 *
 * @param {Response} routerRes - Fetch Response from the main router
 * @param {http.ServerResponse} res - Client response
 * @param {Function} transformFn - (parsedChunk, state) => Uint8Array|Uint8Array[]|null
 * @param {object} state - Mutable state object shared across chunks and flush
 */
async function pipeTransformedEventStream(routerRes, res, transformFn, state) {
  const resHeaders = {
    "Content-Type": "application/vnd.amazon.eventstream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  };
  res.writeHead(200, resHeaders);

  if (!routerRes.body) {
    res.end(await routerRes.text().catch(() => ""));
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB limit
  let buffer = "";
  let clientDisconnected = false;

  // Cancel reader if client disconnects
  res.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Check buffer size limit
      if (buffer.length > MAX_BUFFER_SIZE) {
        throw new Error(`Buffer overflow: exceeded ${MAX_BUFFER_SIZE} bytes`);
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        if (process.env.DEBUG_MITM) {
          log(`[SSE in] ${data.slice(0, 200)}`);
        }

        try {
          const parsed = JSON.parse(data);
          const result = transformFn(parsed, state);
          if (result != null) {
            const outputs = Array.isArray(result) ? result : [result];
            for (const output of outputs) {
              if (process.env.DEBUG_MITM) {
                const len = output.length || output.byteLength || 0;
                log(`[write binary frame] (${len}B) first 20B: ${Array.from(output.slice(0, 20)).join(',')}`);
              }
              res.write(Buffer.from(output));
            }
          }
        } catch (parseError) {
          // Skip unparseable lines
          if (process.env.DEBUG_MITM) {
            log(`[EventStream parse error] ${parseError.message}`);
          }
        }
      }
    }

    // Flush: pass null to signal stream end
    try {
      const flushed = transformFn(null, state);
      if (flushed != null) {
        const outputs = Array.isArray(flushed) ? flushed : [flushed];
        for (const output of outputs) {
          res.write(Buffer.from(output));
        }
      }
    } catch (flushError) {
      if (process.env.DEBUG_MITM) {
        log(`[EventStream flush error] ${flushError.message}`);
      }
    }

    res.end();
  } catch (error) {
    err(`pipeTransformedEventStream error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    if (res.writable && !res.writableEnded) {
      res.end(JSON.stringify({ error: "EventStream transformation error" }));
    }
  } finally {
    // Ensure reader is cleaned up
    reader.cancel().catch(() => {});
  }
}

export { fetchRouter, pipeSSE, pipeTransformedSSE, pipeTransformedEventStream };
