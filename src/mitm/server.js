// src/mitm/server.js
import https from "https";
import http from "http";
import tls from "tls";
import { MITM_CONFIG } from "./config.js";
import { log, err } from "./logger.js";
import { generateRootCA, getCertForDomain } from "./cert/generate.js";
import { intercept } from "./handlers/kiro.js";
import { fetchRouter } from "./handlers/base.js";
import { routeRequest, shouldIntercept } from "./router.js";
import { withQuotaTracking } from "./middleware/quota.js";
import { withSecurity } from "./middleware/security.js";

let server = null;

/**
 * Create middleware-wrapped routing function
 * Applies security checks and quota tracking to all requests
 */
const secureRouter = withSecurity(routeRequest);
const fullRouter = withQuotaTracking(secureRouter);

/**
 * SNI callback - dynamically load certificates for intercepted domains
 */
function sniCallback(servername, cb) {
  try {
    // Check if this is a target host we should intercept
    const isTarget = MITM_CONFIG.TARGET_HOSTS.some(host =>
      servername === host || servername.endsWith(`.${host}`)
    );

    if (!isTarget) {
      cb(new Error(`Not a target host: ${servername}`));
      return;
    }

    // Get or generate certificate for this domain
    const { cert, key } = getCertForDomain(servername);
    const context = tls.createSecureContext({ cert, key });
    cb(null, context);
  } catch (error) {
    err(`SNI callback failed for ${servername}: ${error.message}`);
    cb(error);
  }
}

/**
 * Parse request body into Buffer
 */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB limit

    req.on("data", chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

/**
 * Check if this is a Kiro API request
 */
function isKiroRequest(host, path) {
  // Kiro runtime endpoints
  if (host.includes("runtime.us-east-1.kiro.dev")) {
    return true;
  }

  // CodeWhisperer endpoints
  if (host.includes("codewhisperer.us-east-1.amazonaws.com")) {
    return true;
  }

  // Amazon Q endpoints
  if (host.includes("q.us-east-1.amazonaws.com")) {
    return true;
  }

  return false;
}

/**
 * Apply host rewrites to avoid rate limits
 */
function rewriteHost(host) {
  return MITM_CONFIG.HOST_REWRITE[host] || host;
}

/**
 * Forward non-Kiro requests directly to router
 */
async function forwardToRouter(req, res, body) {
  try {
    const clientHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      // Skip hop-by-hop headers
      if (!["host", "connection", "transfer-encoding"].includes(k.toLowerCase())) {
        clientHeaders[k] = v;
      }
    }

    // Parse body if JSON
    let requestBody;
    try {
      requestBody = JSON.parse(body.toString());
    } catch {
      // Not JSON, send as-is
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON request body" }));
      return;
    }

    const routerRes = await fetchRouter(requestBody, req.url, clientHeaders);

    // Forward response headers
    const resHeaders = {};
    for (const [k, v] of routerRes.headers.entries()) {
      if (!["connection", "transfer-encoding"].includes(k.toLowerCase())) {
        resHeaders[k] = v;
      }
    }

    res.writeHead(routerRes.status, resHeaders);

    // Stream response body
    if (!routerRes.body) {
      res.end(await routerRes.text().catch(() => ""));
      return;
    }

    const reader = routerRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    err(`Router forward failed: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Proxy error" }));
    } else {
      res.end();
    }
  }
}

/**
 * Main request handler - routes to appropriate handler
 */
async function handleRequest(req, res) {
  const host = rewriteHost(req.headers.host || "");
  const path = req.url || "/";
  const method = req.method;

  log(`${method} ${host}${path}`);

  // Only handle POST requests (AI API calls)
  if (method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    // Collect request body with timeout
    const bodyPromise = collectBody(req);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 30000)
    );

    const body = await Promise.race([bodyPromise, timeoutPromise]);

    // Route through middleware-wrapped router
    // This applies security checks, quota tracking, and routes to appropriate handler
    await fullRouter(req, res, body, null);
  } catch (error) {
    err(`Request handler error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Create HTTPS server with SNI callback
 */
function createServer() {
  // Ensure root CA exists before starting
  generateRootCA();

  // Create default cert for server (fallback)
  const defaultHost = MITM_CONFIG.TARGET_HOSTS[0] || "kiro.dev";
  const defaultCert = getCertForDomain(defaultHost);

  server = https.createServer(
    {
      SNICallback: sniCallback,
      cert: defaultCert.cert,
      key: defaultCert.key,
    },
    handleRequest
  );

  return server;
}

/**
 * Start the MITM proxy server
 */
function start() {
  return new Promise((resolve, reject) => {
    if (server) {
      log("Server already running");
      resolve();
      return;
    }

    try {
      createServer();

      server.on("error", (error) => {
        if (error.code === "EACCES") {
          err(`Permission denied: Port ${MITM_CONFIG.LOCAL_PORT} requires administrator privileges`);
          err("Run with sudo/administrator rights or change LOCAL_PORT in config.js");
        } else if (error.code === "EADDRINUSE") {
          err(`Port ${MITM_CONFIG.LOCAL_PORT} is already in use`);
        } else {
          err(`Server error: ${error.message}`);
        }
        reject(error);
      });

      server.listen(MITM_CONFIG.LOCAL_PORT, () => {
        log(`MITM proxy listening on port ${MITM_CONFIG.LOCAL_PORT}`);
        log(`Intercepting: ${MITM_CONFIG.TARGET_HOSTS.join(", ")}`);
        log(`Forwarding to: ${MITM_CONFIG.ROUTER_BASE}`);
        resolve();
      });
    } catch (error) {
      err(`Failed to start server: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Stop the MITM proxy server
 */
function stop() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      log("MITM proxy stopped");
      server = null;
      resolve();
    });

    // Force close after 5 seconds
    setTimeout(() => {
      if (server) {
        log("Force closing server after timeout");
        server.closeAllConnections?.();
        server = null;
      }
      resolve();
    }, 5000);
  });
}

/**
 * Graceful shutdown handler
 */
function setupShutdownHandlers() {
  const shutdown = async (signal) => {
    log(`Received ${signal}, shutting down gracefully...`);
    await stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupShutdownHandlers();
  start().catch((error) => {
    err(`Failed to start: ${error.message}`);
    process.exit(1);
  });
}

export { start, stop, createServer };
