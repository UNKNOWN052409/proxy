#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAvailablePort } from "./lib/runtime/port.js";

const mode = process.argv[2] === "dev" ? "dev" : "start";
const nextBin = path.join(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/next/dist/bin/next");
const preferredPort = process.env.PORT || 2018;
const host = process.env.HOST || "127.0.0.1";

try {
  const port = await findAvailablePort({ preferredPort, host, attempts: process.env.PORT_FALLBACK_MAX_ATTEMPTS });
  if (String(port) !== String(preferredPort)) {
    console.warn(`Preferred port ${preferredPort} is occupied; using localhost port ${port}.`);
  }
  console.log(`Starting Next.js ${mode} server at http://${host}:${port}`);
  const child = spawn(process.execPath, [nextBin, mode, "--hostname", host, "--port", String(port)], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOST: host },
  });
  const forward = (signal) => child.kill(signal);
  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));
  child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not select a local port");
  process.exit(1);
}
