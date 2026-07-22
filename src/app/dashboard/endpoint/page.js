"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Toggle } from "@/components/shared";

export default function EndpointPage() {
  const [copied, setCopied] = useState(false);
  const [port, setPort] = useState("20127");
  const [corsEnabled, setCorsEnabled] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/config/tunnel")
      .then(r => r.json())
      .then(data => {
        if (data.enabled && data.url) {
          setTunnelUrl(data.url);
          setTunnelEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateApiKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let key = "kp-";
    for (let i = 0; i < 32; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    setApiKey(key);
  };

  const localUrl = `http://localhost:${port}/v1`;
  const externalUrl = tunnelUrl ? `${tunnelUrl}/v1` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Endpoint</h1>
        <p className="text-text-muted text-sm mt-1">Configure your proxy endpoint</p>
      </div>

      {/* Connection Details */}
      <Card title="Connection Details" icon="link" subtitle="Use this in your AI tools">
        <div className="space-y-4">
          {/* Local URL */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral" size="sm">Local</Badge>
                <p className="text-xs text-text-subtle font-medium">Base URL</p>
              </div>
              <code className="text-sm text-text-main font-mono mt-1 block">{localUrl}</code>
            </div>
            <Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={() => copyToClipboard(localUrl)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          {/* External URL (if tunnel active) */}
          {externalUrl && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Public
                    </span>
                  </Badge>
                  <p className="text-xs text-text-subtle font-medium">External URL</p>
                </div>
                <code className="text-sm text-text-main font-mono mt-1 block">{externalUrl}</code>
                <p className="text-xs text-text-muted mt-1">
                  Accessible from anywhere. Someone could use your accounts if they get this URL.
                </p>
              </div>
              <Button variant="outline" size="sm" icon="content_copy" onClick={() => copyToClipboard(externalUrl)}>
                Copy
              </Button>
            </div>
          )}

          {/* API Key */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
            <div>
              <p className="text-xs text-text-subtle font-medium">API Key</p>
              <code className="text-sm text-text-muted font-mono mt-1 block">
                {apiKey ? apiKey : "Any value accepted (local proxy)"}
              </code>
            </div>
            {apiKey ? (
              <Button variant="outline" size="sm" icon="content_copy" onClick={() => copyToClipboard(apiKey)}>
                Copy Key
              </Button>
            ) : (
              <Button variant="ghost" size="sm" icon="add" onClick={generateApiKey}>
                Generate
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* External Access */}
      <Card title="External Access" icon="public" subtitle="Make your proxy available globally">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Enable public access so you can use the proxy from any device or share with your team.
          </p>
          <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
            <div className="flex items-center gap-3">
              <span className={`size-3 rounded-full ${tunnelEnabled ? "bg-emerald-500 animate-pulse" : "bg-text-subtle"}`} />
              <div>
                <p className="text-sm font-medium text-text-main">{tunnelEnabled ? "Tunnel Active" : "Local Only"}</p>
                {tunnelUrl && <code className="text-xs text-text-muted font-mono mt-0.5 block">{tunnelUrl}</code>}
              </div>
            </div>
            <a href="/dashboard/settings">
              <Button variant={tunnelEnabled ? "outline" : "primary"} size="sm" icon={tunnelEnabled ? "settings" : "power"}>
                {tunnelEnabled ? "Manage" : "Enable"}
              </Button>
            </a>
          </div>
        </div>
      </Card>

      {/* Client Setup */}
      <Card title="Client Setup" icon="terminal" subtitle="How to connect popular tools">
        <div className="space-y-3">
          {[
            { name: "Claude Code", local: `CLAUSE_CODE_BASE_URL=http://localhost:${port}/v1`, external: externalUrl ? `CLAUSE_CODE_BASE_URL=${externalUrl}` : null },
            { name: "Codex CLI", local: `CODEX_BASE_URL=http://localhost:${port}/v1`, external: externalUrl ? `CODEX_BASE_URL=${externalUrl}` : null },
            { name: "Cursor", local: `Open Settings → Models → Add http://localhost:${port}/v1`, external: externalUrl ? `Open Settings → Models → Add ${externalUrl}` : null },
            { name: "Cline", local: `Open Settings → API Provider → OpenAI Compatible → URL: http://localhost:${port}/v1`, external: externalUrl ? `URL: ${externalUrl}` : null },
            { name: "OpenClaw", local: `Open Settings → Endpoint → http://localhost:${port}/v1`, external: externalUrl ? `Endpoint → ${externalUrl}` : null },
          ].map((tool, i) => (
            <div key={i} className="p-3 rounded-lg bg-surface-2/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="neutral" size="sm">{tool.name}</Badge>
                <span className="text-[10px] text-text-subtle">Local</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-[11px] text-text-muted font-mono truncate">{tool.local}</code>
                <Button variant="ghost" size="sm" icon="content_copy" onClick={() => copyToClipboard(tool.local)} />
              </div>
              {tool.external && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="success" size="xs">Public</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-text-muted font-mono truncate">{tool.external}</code>
                    <Button variant="ghost" size="sm" icon="content_copy" onClick={() => copyToClipboard(tool.external)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Settings */}
      <Card title="Settings" icon="tune" subtitle="Proxy configuration">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-main">CORS Enabled</p>
              <p className="text-xs text-text-muted">Allow cross-origin requests</p>
            </div>
            <Toggle enabled={corsEnabled} onChange={setCorsEnabled} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-main">Port</p>
              <p className="text-xs text-text-muted">Proxy server port</p>
            </div>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-24 h-9 rounded-lg bg-surface border border-border text-text-main text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>
      </Card>

      {/* Test */}
      <Card title="Test Connection" icon="check_circle" subtitle="Verify your proxy is working">
        <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
          <div className="flex items-center gap-3">
            <span className="size-3 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <p className="text-sm font-medium text-text-main">Proxy is Running</p>
              <p className="text-xs text-text-muted">Server is active on port {port}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {externalUrl && (
              <a href={`${externalUrl.replace(/\/v1$/, "")}/api/models`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" icon="public">Test Public</Button>
              </a>
            )}
            <a href={`http://localhost:${port}/api/models`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" icon="open_in_new">Test</Button>
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
