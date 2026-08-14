/**
 * POST /api/config/tunnel — Start/Stop ngrok tunnel for global access
 * GET /api/config/tunnel — Get tunnel status
 */
import { userConfig } from "@/lib/config/store";
import { spawn, execSync } from "child_process";
import { platform } from "os";
import path from "path";
import * as cloudflareTunnel from "@/lib/tunnel/manager";

function findNgrok() {
  const isWin = platform() === "win32";
  const defaultPath = isWin
    ? path.join(/* turbopackIgnore: true */ (process.env.LOCALAPPDATA || process.env.USERPROFILE || "C:\\"), "Ngrok", "ngrok.exe")
    : "ngrok";
  try {
    const which = isWin ? "where" : "which";
    const found = execSync(`${which} ngrok`, { encoding: "utf-8" }).trim().split("\n")[0];
    return found || defaultPath;
  } catch {
    return defaultPath;
  }
}

const NGROK_PATH = findNgrok();

function startNgrokTunnel(port) {
  return new Promise((resolve, reject) => {
    const ngrok = spawn(NGROK_PATH, [
      "http", String(port),
      "--log", "stdout",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const pid = ngrok.pid;
    const TIMEOUT = 15_000;
    const started = Date.now();
    let resolved = false;

    const onData = (chunk) => {
      if (resolved) return;
      const text = chunk.toString();
      const urlMatch = text.match(/https?:\/\/[^\s]+\.ngrok\.(app|io)/);
      if (urlMatch) {
        resolved = true;
        resolve({ url: urlMatch[0], pid });
      }
      // Timeout fallback
      if (Date.now() - started > TIMEOUT && !resolved) {
        resolved = true;
        // Try ngrok local API for URL
        fetch("http://127.0.0.1:4040/api/tunnels")
          .then(r => r.json())
          .then(data => {
            const tunnel = data.tunnels?.[0];
            resolve({ url: tunnel?.public_url || `http://kiro-proxy.ngrok.io`, pid });
          })
          .catch(() => resolve({ url: `http://kiro-proxy.ngrok.io`, pid }));
      }
    };

    ngrok.stdout.on("data", onData);
    ngrok.stderr.on("data", onData);

    ngrok.on("error", (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    ngrok.on("exit", (code) => {
      if (!resolved) { resolved = true; reject(new Error(`ngrok exited with code ${code}`)); }
    });
  });
}

async function getTunnelUrlFromApi() {
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    const data = await res.json();
    return data.tunnels?.[0]?.public_url || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const config = userConfig.get();
  const managed = await cloudflareTunnel.status();
  let liveUrl = null;
  if (config.tunnelEnabled && config.tunnelProvider !== "cloudflare") {
    liveUrl = await getTunnelUrlFromApi();
  }
  return Response.json({
    enabled: managed.enabled || config.tunnelEnabled,
    url: managed.url || liveUrl || config.tunnelUrl || null,
    customDomain: config.customDomain || null,
    port: config.port,
    provider: managed.provider || config.tunnelProvider || null,
    mode: managed.mode || config.tunnelMode || null,
    monitoring: managed,
  });
}

export async function POST(request) {
  try {
    const { action, domain, provider = "cloudflare", mode = "quick", name = null, hostname = null, port = userConfig.get().port || 2018 } = await request.json();

    if (action === "start" && provider === "cloudflare") {
      const result = await cloudflareTunnel.start({ mode, name, hostname, port });
      return Response.json({ success: true, ...result, message: mode === "named" ? "Named Cloudflare tunnel started" : "Temporary Cloudflare Quick Tunnel started" });
    }

    if (action === "status") {
      return Response.json({ success: true, ...(await cloudflareTunnel.status()) });
    }

    if (action === "restart") {
      return Response.json({ success: true, ...(await cloudflareTunnel.restart()) });
    }

    if (action === "start") {
      const existingUrl = await getTunnelUrlFromApi();
      if (existingUrl) {
        userConfig.setTunnelInfo(existingUrl, null);
        return Response.json({ success: true, url: existingUrl, message: "Tunnel already running" });
      }
      const result = await startNgrokTunnel(port);
      userConfig.setTunnelInfo(result.url, result.pid);
      return Response.json({ success: true, url: result.url, message: `Tunnel started at ${result.url}` });
    }

    if (action === "stop") {
      if (provider === "cloudflare" || userConfig.get().tunnelProvider === "cloudflare") {
        return Response.json({ success: true, ...(await cloudflareTunnel.stop()), message: "Cloudflare tunnel stopped" });
      }
      try { await fetch("http://127.0.0.1:4040/api/tunnels", { method: "DELETE" }); } catch { /* ignore */ }
      try {
        if (platform() === "win32") execSync("taskkill /F /IM ngrok.exe 2>NUL", { stdio: "ignore" });
        else execSync("pkill -f ngrok 2>/dev/null", { stdio: "ignore" });
      } catch { /* ignore */ }
      userConfig.clearTunnelInfo();
      return Response.json({ success: true, message: "Tunnel stopped" });
    }

    if (action === "set-domain") {
      userConfig.setCustomDomain(domain);
      return Response.json({ success: true, domain });
    }

    if (action === "clear-domain") {
      userConfig.setCustomDomain(null);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
