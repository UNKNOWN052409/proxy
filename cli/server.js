/**
 * Kiro Proxy Express server — standalone OpenAI-compatible proxy
 * Shares the same ~/.kiro-proxy/accounts.json as the Next.js app
 * Uses real AWS EventStream Kiro executor (not placeholders)
 */

import express from "express";
import cors from "cors";
import { readAccounts } from "./lib.js";

// Import the real Kiro executor
import { executeKiroStream, executeKiroCompletion } from "../src/lib/kiro/proxy.js";

export function createServer(opts = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // GET /v1/models — list models
  app.get("/v1/models", (req, res) => {
    const models = [
      { id: "kr/claude-opus-4.5", object: "model", owned_by: "kiro" },
      { id: "kr/claude-opus-4.5-thinking", object: "model", owned_by: "kiro" },
      { id: "kr/claude-sonnet-4.5", object: "model", owned_by: "kiro" },
      { id: "kr/claude-sonnet-4.5-thinking", object: "model", owned_by: "kiro" },
      { id: "kr/claude-haiku-4.5", object: "model", owned_by: "kiro" },
      { id: "kr/gpt-5.6-sol", object: "model", owned_by: "kiro" },
      { id: "kr/gpt-5.6-terra", object: "model", owned_by: "kiro" },
      { id: "kr/gpt-5.6-luna", object: "model", owned_by: "kiro" },
      { id: "kr/deepseek-3.2", object: "model", owned_by: "kiro" },
    ];
    res.json({ object: "list", data: models });
  });

  // GET /api/accounts — list accounts
  app.get("/api/accounts", (req, res) => {
    const accounts = readAccounts();
    res.json({ accounts });
  });

  // POST /v1/chat/completions — real Kiro proxy endpoint
  app.post("/v1/chat/completions", async (req, res) => {
    const { model, messages, stream = false } = req.body;

    if (!model || !messages) {
      return res.status(400).json({ error: { message: "model and messages are required" } });
    }

    // Get active Kiro accounts
    const allAccounts = readAccounts();
    const activeAccounts = allAccounts.filter(a => a.active !== false && a.provider === "kiro");

    if (activeAccounts.length === 0) {
      return res.status(503).json({ error: { message: "No active accounts available. Import accounts first with 'kiro-proxy import'." } });
    }

    try {
      if (stream) {
        // Use real Kiro streaming executor
        const result = await executeKiroStream({ model, messages, stream: true }, activeAccounts);

        if (result.error) {
          return res.status(result.status || 500).json(result);
        }

        // result is a Web Response — pipe to Express response
        const contentType = "text/event-stream";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");

        const reader = result.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            res.write(value);
          }
        };
        pump().catch(err => {
          if (!res.headersSent) res.status(500).json({ error: { message: err.message } });
          else res.end();
        });
      } else {
        // Non-streaming with real Kiro executor
        const account = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
        const result = await executeKiroCompletion({ model, messages, stream: false }, account);

        if (result.error) {
          return res.status(500).json(result);
        }

        res.json(result);
      }
    } catch (err) {
      res.status(500).json({ error: { message: err.message } });
    }
  });

  // Account info endpoint
  app.get("/v1/account", (req, res) => {
    const accounts = readAccounts();
    res.json({
      accounts: accounts.length,
      active: accounts.filter(a => a.active !== false && a.provider === "kiro").length,
    });
  });

  // Fallback health
  app.get("/", (req, res) => {
    const accounts = readAccounts();
    res.json({
      name: "kiro-proxy",
      version: "1.0.0",
      status: "running",
      accounts: accounts.length,
      active: accounts.filter(a => a.active !== false).length,
    });
  });

  return app;
}
