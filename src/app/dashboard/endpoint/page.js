"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/shared";

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return <Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={copy}>{copied ? "Copied" : label}</Button>;
}

export default function EndpointPage() {
  const [status, setStatus] = useState(null);
  const [keys, setKeys] = useState([]);
  const [keyName, setKeyName] = useState("Local development");
  const [newKey, setNewKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const baseUrl = useMemo(() => typeof window === "undefined" ? "http://localhost:2018/v1" : `${window.location.origin}/v1`, []);

  const load = async () => {
    const [gatewayRes, keyRes] = await Promise.all([fetch("/api/gateway/status", { cache: "no-store" }), fetch("/api/keys", { cache: "no-store" })]);
    const [gatewayData, keyData] = await Promise.all([gatewayRes.json(), keyRes.json()]);
    setStatus(gatewayData);
    setKeys(keyData.keys || []);
  };

  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);

  const createKey = async () => {
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() || "Gateway key", expiresInDays: 365 }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create API key");
      setNewKey(data.key);
      setKeys((current) => [data.metadata, ...current]);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setCreating(false);
    }
  };

  const clients = [
    { name: "Generic OpenAI client", command: `OPENAI_BASE_URL=${baseUrl}\nOPENAI_API_KEY=<your-gateway-key>` },
    { name: "OpenAI SDK", command: `base_url="${baseUrl}"\napi_key="<your-gateway-key>"` },
    { name: "Any compatible desktop client", command: `Base URL: ${baseUrl}\nAPI key: <your-gateway-key>` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Endpoint & Access</h1>
          <p className="text-text-muted text-sm mt-1">Connect compatible clients with a real, revocable gateway API key.</p>
        </div>
        <Button variant="outline" size="sm" icon="refresh" onClick={() => load().catch((cause) => setError(cause.message))}>Refresh</Button>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-300">{error}</div>}

      <Card title="Gateway URL" icon="link" subtitle="The OpenAI-compatible API base path">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg border border-border">
          <code className="flex-1 text-sm font-mono text-text-main truncate">{baseUrl}</code>
          <CopyButton value={baseUrl} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {[
            ["Provider status", status?.enabled ? "Ready" : "Not configured", status?.enabled ? "success" : "neutral"],
            ["Enabled providers", String(status?.providers?.filter((provider) => provider.configured).length || 0), "brand"],
            ["Available models", String((status?.providers || []).reduce((total, provider) => total + (provider.models?.length || 0), 0)), "neutral"],
          ].map(([label, value, variant]) => (
            <div key={label} className="p-3 rounded-lg bg-surface-2/50 border border-border">
              <p className="text-xs text-text-subtle">{label}</p>
              <Badge variant={variant} size="sm" className="mt-2">{value}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Create API Key" icon="key" subtitle="Keys are stored as hashes and the raw value is shown only once">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={100} className="flex-1 h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="Key name" />
          <Button variant="primary" icon="add" onClick={createKey} disabled={creating}>{creating ? "Creating…" : "Create key"}</Button>
        </div>
        {newKey && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/25">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-300">Save this key now</p>
                <code className="block text-xs text-text-main font-mono mt-2 break-all">{newKey}</code>
                <p className="text-xs text-text-muted mt-2">For security, it cannot be shown again after you leave this page.</p>
              </div>
              <CopyButton value={newKey} label="Copy key" />
            </div>
          </div>
        )}
      </Card>

      <Card title="Client Setup" icon="terminal" subtitle="Use an API key from the section above; route models as provider-id/model-id">
        <div className="space-y-3">
          {clients.map((client) => <div key={client.name} className="p-3 rounded-lg bg-surface-2/50 border border-border">
            <div className="flex items-center justify-between gap-2 mb-2"><Badge variant="neutral" size="sm">{client.name}</Badge><CopyButton value={client.command} /></div>
            <pre className="text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all">{client.command}</pre>
          </div>)}
        </div>
      </Card>

      <Card title="Gateway Behavior" icon="tune" subtitle="Compatibility features and their execution boundaries">
        {status ? <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ["Tool compatibility", "Non-tool models return validated tool-call objects for the connected client to execute.", "build"],
            ["Vision fallback", "A configured vision provider can convert inline images into text descriptions for text-only models.", "visibility"],
            ["Usage analytics", "Every gateway request contributes to the dashboard usage summaries.", "analytics"],
            ["Security boundaries", "No cookie conversion, browser-session access, arbitrary tool execution, or traffic interception.", "shield"],
          ].map(([title, description, icon]) => <div key={title} className="p-3 rounded-lg bg-bg border border-border"><span className="material-symbols-outlined text-brand-400">{icon}</span><p className="text-sm text-text-main font-medium mt-2">{title}</p><p className="text-xs text-text-muted leading-relaxed mt-1">{description}</p></div>)}
        </div> : <Skeleton variant="card" />}
      </Card>

      <Card title="Active Keys" icon="vpn_key" subtitle="Raw API-key values are never listed">
        {keys.length === 0 ? <p className="text-sm text-text-muted py-3">No API keys created yet.</p> : <div className="space-y-2">{keys.slice(0, 8).map((key) => <div key={key.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-bg border border-border"><div><p className="text-sm text-text-main">{key.name}</p><p className="text-xs text-text-subtle mt-0.5">Expires {new Date(key.expires_at).toLocaleDateString()} · last used {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}</p></div><Badge variant="success" size="sm">Active</Badge></div>)}</div>}
      </Card>
    </div>
  );
}
