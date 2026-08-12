"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/shared";

function Capability({ enabled, icon, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border ${enabled ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-text-subtle bg-surface border-border"}`}>
      <span className="material-symbols-outlined text-[14px]">{icon}</span>{label}
    </span>
  );
}

const exampleProvider = JSON.stringify([{
  id: "custom-api",
  label: "My OpenAI-compatible API",
  type: "openai",
  baseUrl: "https://api.example.com/v1",
  apiKeyEnv: "GATEWAY_CUSTOM_API_KEY",
  models: ["chat-model"],
  defaultModel: "chat-model",
  supportsTools: false,
  supportsVision: false,
  enabled: true,
}], null, 2);

function healthBadge(provider) {
  if (provider.expired) return { variant: "error", label: "Expired" };
  if (!provider.enabled) return { variant: "neutral", label: "Disabled" };
  if (!provider.configured) return { variant: "error", label: "Secret missing" };
  if (provider.health?.status === "healthy") return { variant: "success", label: "Healthy" };
  if (provider.health?.status === "authentication_error") return { variant: "error", label: "Credential rejected" };
  if (provider.health?.status === "unavailable" || provider.health?.status === "timeout") return { variant: "warning", label: "Unavailable" };
  return { variant: "neutral", label: "Not checked" };
}

export default function GatewayPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busyProvider, setBusyProvider] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(exampleProvider);
  const [message, setMessage] = useState(null);
  const [credentialProvider, setCredentialProvider] = useState("");
  const [credentialText, setCredentialText] = useState("");
  const baseUrl = useMemo(() => typeof window === "undefined" ? "http://localhost:2018/v1" : `${window.location.origin}/v1`, []);

  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/gateway/providers", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load gateway status");
      setStatus(data);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Gateway status could not be loaded" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const refreshProvider = async (providerId = null) => {
    setBusyProvider(providerId || "all");
    setMessage(null);
    try {
      const response = await fetch("/api/gateway/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerId ? { providerId } : {}),
      });
      const result = await response.json();
      if (!response.ok && !result.results) throw new Error(result.error || "Model refresh failed");
      const details = result.results ? result.results.map((item) => `${item.providerId}: ${item.ok ? `${item.modelCount} models` : item.error}`).join(" · ") : (result.ok ? `${result.modelCount} models discovered` : result.error);
      setMessage({ type: result.ok === false ? "warning" : "success", text: details });
      await refresh({ silent: true });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Model refresh failed" });
    } finally {
      setBusyProvider(null);
    }
  };

  const importProviders = async () => {
    setMessage(null);
    let providers;
    try {
      providers = JSON.parse(importText);
    } catch (error) {
      setMessage({ type: "error", text: `Invalid JSON: ${error.message}` });
      return;
    }
    setBusyProvider("import");
    try {
      const response = await fetch("/api/gateway/providers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", providers }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Provider import failed");
      setStatus(result.status);
      setMessage({ type: "success", text: result.results.map((item) => `${item.id} ${item.action}`).join(" · ") });
      setImportOpen(false);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Provider import failed" });
    } finally {
      setBusyProvider(null);
    }
  };

  const importCredentials = async () => {
    setMessage(null);
    let credentials;
    try { credentials = JSON.parse(credentialText); } catch (error) { setMessage({ type: "error", text: `Invalid credential JSON: ${error.message}` }); return; }
    setBusyProvider("credentials");
    try {
      const response = await fetch("/api/gateway/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import_credentials", providerId: credentialProvider, credentials }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Credential import failed");
      setStatus(result.status);
      setCredentialText("");
      setMessage({ type: "success", text: `${result.imported.length} encrypted credential${result.imported.length === 1 ? "" : "s"} imported for ${credentialProvider}.` });
    } catch (error) { setMessage({ type: "error", text: error.message || "Credential import failed" }); }
    finally { setBusyProvider(null); }
  };

  const setEnabled = async (provider, enabled) => {
    setBusyProvider(provider.id);
    setMessage(null);
    try {
      const response = await fetch("/api/gateway/providers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_enabled", providerId: provider.id, enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Provider status update failed");
      setStatus(result.status);
      setMessage({ type: "success", text: `${provider.label} ${enabled ? "enabled" : "disabled"}` });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Provider status update failed" });
    } finally {
      setBusyProvider(null);
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton variant="card" /><Skeleton variant="card" /><Skeleton variant="card" /></div>;
  const providers = status?.providers || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-text-main">Gateway</h1><Badge variant={status?.enabled ? "success" : "neutral"} size="sm" dot>{status?.enabled ? "Ready" : "Needs setup"}</Badge></div>
          <p className="text-sm text-text-muted mt-1">Authorized API providers, normalized for OpenAI-compatible clients.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" icon="refresh" onClick={() => refresh()}>Refresh status</Button><Button variant="primary" size="sm" icon="add" onClick={() => setImportOpen((value) => !value)}>Add provider</Button></div>
      </div>

      {message && <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${message.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-300" : message.type === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-200" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"}`}><span className="material-symbols-outlined text-[18px]">{message.type === "error" ? "error" : message.type === "warning" ? "warning" : "check_circle"}</span><p>{message.text}</p></div>}

      {(status?.notifications || []).map((notice) => <div key={notice.id} className={`flex items-start gap-3 p-4 rounded-xl border ${notice.severity === "error" ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}><span className={`material-symbols-outlined ${notice.severity === "error" ? "text-red-300" : "text-amber-300"}`}>{notice.severity === "error" ? "error" : "schedule"}</span><div><p className="text-sm font-medium text-text-main">Provider attention required</p><p className="text-xs text-text-muted mt-1">{notice.message}</p></div></div>)}

      <Card title="Connection" icon="api" subtitle="Use this URL in OpenAI-compatible clients">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg border border-border"><code className="flex-1 text-sm font-mono text-text-main truncate">{baseUrl}</code><Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={copy}>{copied ? "Copied" : "Copy"}</Button></div>
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-text-muted"><div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>GET /v1/models</code><p className="mt-1">Lists enabled, non-expired provider models.</p></div><div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>POST /v1/chat/completions</code><p className="mt-1">Requires a dashboard-created Bearer key.</p></div></div>
      </Card>

      {importOpen && <Card title="Merge provider configuration" icon="upload_file" subtitle="Imports update matching IDs and keep all other configured providers. Secrets stay in server environment variables."><div className="space-y-3"><textarea value={importText} onChange={(event) => setImportText(event.target.value)} className="w-full min-h-[260px] rounded-xl border border-border bg-bg p-4 text-xs font-mono text-text-main focus:outline-none focus:ring-2 focus:ring-brand-500/30" spellCheck="false" /><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted"><p>Allowed types: <code>openai</code>, <code>anthropic</code>. HTTPS is required except for loopback development URLs. Credential values, cookies, and authorization headers are rejected.</p><Button variant="primary" size="sm" icon="file_download" loading={busyProvider === "import"} onClick={importProviders}>Merge configuration</Button></div></div></Card>}

      {importOpen && <Card title="Import authorized API-key pool" icon="key" subtitle="Keys are encrypted locally with GATEWAY_CREDENTIAL_MASTER_KEY and never returned after import."><div className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><input value={credentialProvider} onChange={(event) => setCredentialProvider(event.target.value)} placeholder="provider id, e.g. custom-api" className="rounded-xl border border-border bg-bg p-3 text-sm text-text-main" /><textarea value={credentialText} onChange={(event) => setCredentialText(event.target.value)} placeholder={'[{\"label\":\"primary\",\"apiKey\":\"...\"}]'} className="min-h-[100px] rounded-xl border border-border bg-bg p-3 text-xs font-mono text-text-main" spellCheck="false" /></div><div className="flex items-center justify-between gap-2 text-xs text-text-muted"><p>Only user-owned API keys or official OAuth tokens. Cookies, passwords, and session tokens are rejected.</p><Button variant="primary" size="sm" icon="lock" loading={busyProvider === "credentials"} disabled={!credentialProvider || !credentialText} onClick={importCredentials}>Encrypt & import</Button></div></div></Card>}

      <Card title="Authorized providers" icon="hub" subtitle="Validate credentials with a documented model-list request, then selectively enable each provider.">
        <div className="flex justify-end mb-3"><Button variant="outline" size="sm" icon="sync" loading={busyProvider === "all"} disabled={providers.length === 0} onClick={() => refreshProvider()}>Refresh all models</Button></div>
        {providers.length === 0 ? <div className="text-center py-8"><span className="material-symbols-outlined text-3xl text-text-subtle">settings_suggest</span><p className="text-sm text-text-muted mt-3">No provider is configured yet.</p><p className="text-xs text-text-subtle mt-1">Add a provider config, set its API key in the server environment, then run a model refresh.</p></div> : <div className="grid lg:grid-cols-2 gap-3">{providers.map((provider) => {
          const badge = healthBadge(provider);
          const modelCount = provider.models?.length || provider.catalogModelCount || 0;
          return <div key={provider.id} className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/25 transition-colors"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-text-main truncate">{provider.label}</p><p className="text-xs font-mono text-text-subtle mt-0.5 truncate">{provider.id} · {provider.type} · {provider.credentialPool?.count || 0} key{provider.credentialPool?.count === 1 ? "" : "s"}</p></div><Badge variant={badge.variant} size="sm">{badge.label}</Badge></div><div className="flex flex-wrap gap-2 mt-4"><Capability enabled={provider.supportsTools} icon="build" label={provider.supportsTools ? "Native tools" : "Tool bridge"} /><Capability enabled={provider.supportsVision || provider.visionProvider} icon="image" label={provider.supportsVision ? "Native vision" : provider.visionProvider ? "Vision fallback" : "Text only"} /><Capability enabled={modelCount > 0} icon="model_training" label={`${modelCount} model${modelCount === 1 ? "" : "s"}`} /></div><div className="mt-3 space-y-1 text-xs text-text-muted"><p>Default: <span className="font-mono text-text-main">{provider.defaultModel || "discover on refresh"}</span></p><p>Last check: {provider.health?.checkedAt ? new Date(provider.health.checkedAt).toLocaleString() : "not yet checked"}{provider.health?.latencyMs ? ` · ${provider.health.latencyMs} ms` : ""}</p>{provider.health?.message && <p className="text-amber-300">{provider.health.message}</p>}</div><div className="flex flex-wrap gap-2 mt-4"><Button variant="outline" size="sm" icon="sync" loading={busyProvider === provider.id} onClick={() => refreshProvider(provider.id)}>Test & refresh</Button><Button variant={provider.enabled ? "ghost" : "primary"} size="sm" icon={provider.enabled ? "pause_circle" : "play_circle"} loading={busyProvider === provider.id} onClick={() => setEnabled(provider, !provider.enabled)}>{provider.enabled ? "Disable" : "Enable"}</Button></div></div>;
        })}</div>}
      </Card>

      <Card title="Daily model refresh" icon="update" subtitle="Model discovery is explicit, bounded, and does not scrape browser sessions."><div className="grid md:grid-cols-2 gap-3 text-sm"><div className="p-4 rounded-xl bg-surface-2/50 border border-border"><p className="font-medium text-text-main">Manual or deployment scheduler</p><p className="text-xs text-text-muted mt-1">Run the refresh command once daily through your server’s scheduled-task facility. This is the lightest option and uses no always-on job process.</p><code className="block mt-3 p-2 rounded bg-bg border border-border text-[11px]">npm run gateway:refresh-models</code></div><div className="p-4 rounded-xl bg-surface-2/50 border border-border"><p className="font-medium text-text-main">Dashboard-triggered refresh</p><p className="text-xs text-text-muted mt-1">Use “Refresh all models” after changing provider permissions or models. The result records health, latency, and a bounded model catalog.</p><p className="text-xs text-text-subtle mt-3">Last full refresh: {status?.lastRefreshAt ? new Date(status.lastRefreshAt).toLocaleString() : "never"}</p></div></div></Card>

      <Card title="Compatibility controls" icon="verified_user" subtitle="Predictable boundaries for authorized integrations"><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[["Client-managed tools", "Non-tool models return validated tool-call objects; the client executes them.", "handyman"], ["Vision fallback", "A configured vision API can describe bounded inline images for a text-only model.", "visibility"], ["Provider health", "Credential validity and model discovery use provider model-list endpoints.", "monitor_heart"], ["Authorized key failover", "User-owned API keys can rotate with cooldowns; cookies, sessions, and account scraping are not used.", "shield"]].map(([title, detail, icon]) => <div key={title} className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="material-symbols-outlined text-brand-400">{icon}</span><p className="text-sm font-medium text-text-main mt-2">{title}</p><p className="text-xs leading-relaxed text-text-muted mt-1">{detail}</p></div>)}</div></Card>
    </div>
  );
}
