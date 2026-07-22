"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Skeleton } from "@/components/shared";

export default function MitmProxyPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    // Load MITM configuration
    // Since there's no API endpoint yet, we'll show static config info
    setConfig({
      localPort: 443,
      routerBase: "http://localhost:20127",
      targetHosts: [
        "runtime.us-east-1.kiro.dev",
        "codewhisperer.us-east-1.amazonaws.com",
        "q.us-east-1.amazonaws.com",
      ],
      status: "configured", // Can be: running, stopped, configured, error
    });
    setLoading(false);
  }, []);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-main">MITM Proxy</h1>
        <p className="text-text-muted text-sm mt-1">
          Man-in-the-middle proxy for intercepting and routing Kiro AI requests
        </p>
      </div>

      {/* Status Card */}
      <Card title="Proxy Status" icon="router" subtitle="Current proxy server state">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-amber-400">
                  {config.status === "running" ? "play_circle" : "settings"}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-text-main">
                  {config.status === "running" ? "Running" : "Not Running"}
                </p>
                <p className="text-xs text-text-muted">
                  {config.status === "running"
                    ? "Proxy is actively intercepting requests"
                    : "Proxy server is configured but not started"}
                </p>
              </div>
            </div>
            <Badge
              variant={config.status === "running" ? "success" : "neutral"}
              size="md"
              dot={config.status === "running"}
            >
              {config.status === "running" ? "Active" : "Idle"}
            </Badge>
          </div>

          {config.status !== "running" && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">info</span>
                <div className="text-xs text-text-muted">
                  <p className="font-medium text-amber-400 mb-1">Manual Start Required</p>
                  <p>
                    The MITM proxy must be started manually from the command line. Run{" "}
                    <code className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">
                      node src/mitm/server.js
                    </code>{" "}
                    with administrator privileges.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Configuration */}
      <Card title="Configuration" icon="settings" subtitle="Proxy server settings">
        <div className="space-y-3">
          {/* Local Port */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg">
            <div>
              <p className="text-sm font-medium text-text-main">Local Port</p>
              <p className="text-xs text-text-muted">Port the proxy listens on (requires admin/sudo)</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm font-mono text-brand-400">
                {config.localPort}
              </code>
              <Button
                variant="ghost"
                size="sm"
                icon="content_copy"
                onClick={() => copyToClipboard(config.localPort.toString(), "port")}
              >
                {copied === "port" ? "✓" : ""}
              </Button>
            </div>
          </div>

          {/* Router Base */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg">
            <div>
              <p className="text-sm font-medium text-text-main">Router Base URL</p>
              <p className="text-xs text-text-muted">Where intercepted requests are forwarded</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono text-text-main truncate max-w-[200px]">
                {config.routerBase}
              </code>
              <Button
                variant="ghost"
                size="sm"
                icon="content_copy"
                onClick={() => copyToClipboard(config.routerBase, "router")}
              >
                {copied === "router" ? "✓" : ""}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Target Hosts */}
      <Card title="Target Hosts" icon="dns" subtitle="Domains intercepted by the proxy">
        <div className="space-y-2">
          {config.targetHosts.map((host, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-bg hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-brand-400">public</span>
                <code className="text-sm font-mono text-text-main">{host}</code>
              </div>
              <Badge variant="brand" size="sm">
                Intercepted
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Setup Instructions */}
      <Card title="Setup Instructions" icon="school" subtitle="How to use the MITM proxy">
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 size-6 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-400">
              1
            </div>
            <div>
              <p className="text-sm font-medium text-text-main mb-1">Install Root Certificate</p>
              <p className="text-xs text-text-muted mb-2">
                The proxy generates a self-signed root CA certificate. You must install and trust this certificate
                in your system and IDE.
              </p>
              <code className="block px-3 py-2 rounded-lg bg-surface border border-border text-xs font-mono text-text-main">
                Certificate location: data/mitm-ca/root-ca.crt
              </code>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 size-6 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-400">
              2
            </div>
            <div>
              <p className="text-sm font-medium text-text-main mb-1">Start the Proxy (Admin Required)</p>
              <p className="text-xs text-text-muted mb-2">
                Port 443 requires administrator/root privileges. Run with sudo or as administrator.
              </p>
              <code className="block px-3 py-2 rounded-lg bg-surface border border-border text-xs font-mono text-text-main">
                sudo node src/mitm/server.js
              </code>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 size-6 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-400">
              3
            </div>
            <div>
              <p className="text-sm font-medium text-text-main mb-1">Configure DNS/Hosts File</p>
              <p className="text-xs text-text-muted mb-2">
                Point target hosts to 127.0.0.1 in your system's hosts file to redirect traffic through the proxy.
              </p>
              <div className="space-y-1">
                {config.targetHosts.map((host, i) => (
                  <code key={i} className="block px-3 py-1.5 rounded-lg bg-surface border border-border text-[10px] font-mono text-text-main">
                    127.0.0.1 {host}
                  </code>
                ))}
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 size-6 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-400">
              4
            </div>
            <div>
              <p className="text-sm font-medium text-text-main mb-1">Test the Connection</p>
              <p className="text-xs text-text-muted">
                Make a request from your IDE/client. The proxy will intercept it, forward to your Kiro Proxy router,
                and return the response.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Warning Card */}
      <Card padding="sm">
        <div className="flex items-start gap-3 p-3">
          <span className="material-symbols-outlined text-[20px] text-red-400 shrink-0">warning</span>
          <div className="text-xs text-text-muted">
            <p className="font-medium text-red-400 mb-1">Security Notice</p>
            <p>
              The MITM proxy intercepts HTTPS traffic using a self-signed certificate. Only use this in development
              environments. Never use untrusted certificates in production or on networks you don't control.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
