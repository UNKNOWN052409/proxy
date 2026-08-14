import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { userConfig } from "@/lib/config/store";

const DEFAULT_CHECK_INTERVAL_MS = 15_000;
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60_000;

let child = null;
let monitorTimer = null;
let state = {
  enabled: false,
  provider: null,
  mode: null,
  url: null,
  status: "stopped",
  pid: null,
  localHealthy: null,
  publicHealthy: null,
  lastCheckAt: null,
  lastError: null,
  restartCount: 0,
  nextRestartAt: null,
};
let restartHistory = [];

function now() { return new Date().toISOString(); }

function binaryPath() {
  const configured = process.env.CLOUDFLARED_BIN || "cloudflared";
  if (configured.includes(path.sep) && fs.existsSync(configured)) return configured;
  try { return execFileSync("sh", ["-lc", `command -v ${configured}`], { encoding: "utf8" }).trim() || configured; } catch { return configured; }
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch { return null; }
}

function publicUrlFromText(text) {
  const match = String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match ? match[0] : null;
}

function publicState() {
  return { ...state };
}

function persist() {
  userConfig.setAll({
    tunnelEnabled: state.enabled,
    tunnelUrl: state.url,
    tunnelProcessId: state.pid,
    tunnelProvider: state.provider,
    tunnelMode: state.mode,
    tunnelStatus: state.status,
    tunnelLastCheckAt: state.lastCheckAt,
    tunnelLastError: state.lastError,
  });
}

function clearMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

async function checkUrl(url, timeoutMs = 5000) {
  if (!url) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return response.ok;
  } catch { return false; }
}

async function monitor() {
  if (!state.enabled) return;
  const localUrl = `http://127.0.0.1:${Number(userConfig.get().port || 2018)}`;
  const localHealthy = await checkUrl(localUrl);
  const publicHealthy = state.url ? await checkUrl(state.url) : null;
  state.localHealthy = localHealthy;
  state.publicHealthy = publicHealthy;
  state.lastCheckAt = now();
  if (!localHealthy) state.lastError = "Local gateway health check failed";
  else if (state.url && publicHealthy === false) state.lastError = "Public tunnel health check failed";
  else state.lastError = null;
  if ((!localHealthy || publicHealthy === false) && child && child.exitCode === null) {
    state.status = "degraded";
  } else if (localHealthy && (publicHealthy === null || publicHealthy)) {
    state.status = "healthy";
  }
  persist();
}

function scheduleMonitor() {
  clearMonitor();
  monitorTimer = setInterval(() => { monitor().catch(() => {}); }, Number(process.env.TUNNEL_MONITOR_INTERVAL_MS || DEFAULT_CHECK_INTERVAL_MS));
  monitorTimer.unref?.();
  monitor().catch(() => {});
}

function canRestart() {
  const cutoff = Date.now() - RESTART_WINDOW_MS;
  restartHistory = restartHistory.filter((timestamp) => timestamp > cutoff);
  return restartHistory.length < MAX_RESTARTS;
}

async function restartIfNeeded() {
  if (!state.enabled || !state.provider || !canRestart()) return false;
  restartHistory.push(Date.now());
  state.restartCount += 1;
  state.nextRestartAt = new Date(Date.now() + 1000).toISOString();
  state.status = "restarting";
  persist();
  const options = state.mode === "named" ? { mode: "named", name: state.name, hostname: state.hostname, port: state.port } : { mode: "quick", port: state.port };
  await stop({ preserveConfig: true });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await start(options);
  return true;
}

function attachChild(proc) {
  child = proc;
  state.pid = proc.pid || null;
  proc.stdout?.on("data", (chunk) => {
    const url = publicUrlFromText(chunk.toString());
    if (url && !state.url) { state.url = url; state.status = "starting"; persist(); }
  });
  proc.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    const url = publicUrlFromText(text);
    if (url && !state.url) { state.url = url; state.status = "starting"; persist(); }
  });
  proc.on("exit", (code, signal) => {
    if (child !== proc) return;
    child = null;
    if (state.enabled) {
      state.status = "down";
      state.pid = null;
      state.lastError = `Tunnel exited${code == null ? ` by ${signal || "signal"}` : ` with code ${code}`}`;
      persist();
      if (canRestart()) setTimeout(() => { restartIfNeeded().catch(() => {}); }, 1000).unref?.();
    } else {
      state.status = "stopped";
      state.pid = null;
      persist();
    }
  });
}

export async function start({ mode = "quick", port = userConfig.get().port || 2018, name = null, hostname = null } = {}) {
  if (child && child.exitCode === null) return publicState();
  if (mode === "named" && !name) throw new Error("Named Cloudflare tunnels require an existing tunnel name");
  const bin = binaryPath();
  const args = mode === "named"
    ? ["tunnel", "--no-autoupdate", "run", name]
    : ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${Number(port)}`];
  const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], detached: false, env: { ...process.env } });
  state = {
    ...state,
    enabled: true,
    provider: "cloudflare",
    mode,
    port: Number(port),
    name,
    hostname: hostname || null,
    url: mode === "named" ? safeUrl(hostname) : null,
    status: "starting",
    pid: proc.pid || null,
    localHealthy: null,
    publicHealthy: null,
    lastCheckAt: null,
    lastError: null,
  };
  attachChild(proc);
  persist();
  scheduleMonitor();
  return publicState();
}

export async function stop({ preserveConfig = false } = {}) {
  clearMonitor();
  state.enabled = false;
  state.status = "stopping";
  if (child && child.exitCode === null) {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
    setTimeout(() => { try { if (child && child.exitCode === null) child.kill("SIGKILL"); } catch { /* ignore */ } }, 3000).unref?.();
  }
  child = null;
  state = { ...state, enabled: false, status: "stopped", pid: null, url: preserveConfig ? state.url : null, lastCheckAt: now() };
  if (!preserveConfig) persist();
  return publicState();
}

export async function status() {
  if (state.enabled && (!state.lastCheckAt || Date.now() - Date.parse(state.lastCheckAt) > 10_000)) await monitor();
  return publicState();
}

export async function restart() {
  const current = { mode: state.mode || "quick", port: state.port || userConfig.get().port || 2018, name: state.name || null, hostname: state.hostname || null };
  await stop();
  return start(current);
}

export function resetForTests() {
  clearMonitor();
  try { child?.kill("SIGKILL"); } catch { /* ignore */ }
  child = null;
  state = { enabled: false, provider: null, mode: null, url: null, status: "stopped", pid: null, localHealthy: null, publicHealthy: null, lastCheckAt: null, lastError: null, restartCount: 0, nextRestartAt: null };
  restartHistory = [];
}
