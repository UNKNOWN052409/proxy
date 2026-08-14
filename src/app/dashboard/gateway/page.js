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

function ProviderLogo({ provider, size = "md" }) {
  const [failed, setFailed] = useState(false);
  const initials = String(provider?.label || provider?.id || "AI")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const dimensions = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  if (!failed && provider?.logoPath) {
    return <span className={`${dimensions} shrink-0 rounded-xl bg-white/95 border border-border p-1.5 flex items-center justify-center`}><img src={provider.logoPath} alt={`${provider.label} logo`} className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} /></span>;
  }
  return <span className={`${dimensions} shrink-0 rounded-xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center text-xs font-bold text-brand-300`} aria-label={`${provider?.label || provider?.id || "Provider"} logo`}>{initials || "AI"}</span>;
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
  if (provider.health?.status === "quarantined") return { variant: "error", label: "Quarantined" };
  if (provider.health?.status === "authentication_error") return { variant: "error", label: "Credential rejected" };
  if (provider.health?.status === "unavailable" || provider.health?.status === "timeout") return { variant: "warning", label: "Unavailable" };
  return { variant: "neutral", label: "Not checked" };
}

function routingBadge(operations) {
  const status = operations?.routingStatus || "not_configured";
  if (status === "eligible") return { variant: "success", label: "Routing eligible" };
  if (["disabled", "expired", "quarantined", "credential_blocked"].includes(status)) return { variant: "error", label: status.replaceAll("_", " ") };
  return { variant: "warning", label: status.replaceAll("_", " ") };
}

function auditBadge(audit) {
  if (!audit) return { variant: "neutral", label: "Not audited" };
  if (audit.authenticity?.status === "quarantined") return { variant: "error", label: "Authenticity quarantine" };
  if (audit.leakage?.passed === false) return { variant: "error", label: "Leak indicator" };
  if (audit.identity?.verdict === "inconsistent") return { variant: "error", label: "Model mismatch" };
  if (audit.proxyOverheadUnderTarget === false) return { variant: "warning", label: "Overhead > 1 ms" };
  return { variant: "success", label: "Provisionally consistent" };
}

function accessCategory(profile) {
  if (profile.localOnly) return { id: "local", title: "Local / documented no-auth", detail: "Only loopback or user-operated local model servers; never a third-party web session." };
  if (profile.catalogOnly || profile.freeTierCatalog) return { id: "catalog", title: "Catalog candidate / explicit setup", detail: "Availability must be verified against official documentation and your own authorized account." };
  if (profile.authModes?.some((mode) => mode.startsWith("oauth2"))) return { id: "oauth", title: "Official OAuth or device authorization", detail: "Provider-published consent flow; tokens are encrypted per account." };
  if (profile.authModes?.some((mode) => ["api-key", "bearer-token", "aws-credentials", "service-principal", "managed-identity", "service-account"].includes(mode))) return { id: "api", title: "Official API key, token, or workload identity", detail: "Use only a provider-issued credential or configured workload identity." };
  return { id: "custom", title: "Authorized custom endpoint", detail: "Requires an explicitly documented or administrator-authorized endpoint and credential." };
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
  const [probeCount, setProbeCount] = useState(1);
  const [contextSize, setContextSize] = useState(0);
  const [verifyOnImport, setVerifyOnImport] = useState(true);
  const [credentialResults, setCredentialResults] = useState({});
  const [deviceAuthorizations, setDeviceAuthorizations] = useState({});
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

  const connectOAuth = async (providerId) => {
    setBusyProvider(`oauth:${providerId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/gateway/oauth/${encodeURIComponent(providerId)}/authorize`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "OAuth authorization could not be started");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "OAuth authorization could not be started" });
      setBusyProvider(null);
    }
  };

  const startDeviceAuthorization = async (providerId) => {
    setBusyProvider(`device:${providerId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/gateway/oauth/${encodeURIComponent(providerId)}/device`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const result = await response.json();
      if (!response.ok || !result.state || !result.userCode) throw new Error(result.error || "Device authorization could not be started");
      setDeviceAuthorizations((current) => ({ ...current, [providerId]: result }));
      setMessage({ type: "success", text: `${providerId}: open the verification link and enter the displayed code. The gateway never receives browser cookies or sessions.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Device authorization could not be started" });
    } finally {
      setBusyProvider(null);
    }
  };

  const pollDeviceAuthorization = async (providerId) => {
    const device = deviceAuthorizations[providerId];
    if (!device?.state) return;
    setBusyProvider(`device:${providerId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/gateway/oauth/${encodeURIComponent(providerId)}/device`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "poll", state: device.state }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Device authorization check failed");
      if (result.authorized) {
        setDeviceAuthorizations((current) => { const next = { ...current }; delete next[providerId]; return next; });
        setMessage({ type: "success", text: `${providerId}: official OAuth token encrypted and connected.` });
        await refresh({ silent: true });
      } else {
        setDeviceAuthorizations((current) => ({ ...current, [providerId]: { ...device, retryAfterSeconds: result.retryAfterSeconds } }));
        setMessage({ type: "warning", text: `${providerId}: authorization is still pending. Retry after ${result.retryAfterSeconds || 5} seconds.` });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Device authorization check failed" });
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
      const response = await fetch("/api/gateway/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import_credentials", providerId: credentialProvider, credentials, verify: verifyOnImport, probeCount, contextSizes: contextSize ? [contextSize] : [] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Credential import failed");
      setStatus(result.status);
      setCredentialText("");
      if (result.verification?.length) setCredentialResults((current) => ({ ...current, [credentialProvider]: result.verification }));
      const failed = result.verification?.filter((item) => item.status !== "verified").length || 0;
      setMessage({ type: failed ? "warning" : "success", text: `${result.imported.length} encrypted credential${result.imported.length === 1 ? "" : "s"} imported for ${credentialProvider}${result.verification?.length ? `; ${failed ? `${failed} require attention` : "all verified"}` : "."}` });
    } catch (error) { setMessage({ type: "error", text: error.message || "Credential import failed" }); }
    finally { setBusyProvider(null); }
  };

  const verifyCredentialPool = async (providerId) => {
    setBusyProvider(`credentials:${providerId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/gateway/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_credentials", providerId, probeCount, contextSizes: contextSize ? [contextSize] : [] }) });
      const result = await response.json();
      if (!response.ok && !result.verification) throw new Error(result.error || "Credential verification failed");
      setCredentialResults((current) => ({ ...current, [providerId]: result.verification || [] }));
      const attention = (result.verification || []).filter((item) => item.status !== "verified").length;
      setMessage({ type: attention ? "warning" : "success", text: `${providerId}: ${attention ? `${attention} credential${attention === 1 ? "" : "s"} require attention` : "all credentials verified"}.` });
      await refresh({ silent: true });
    } catch (error) { setMessage({ type: "error", text: error.message || "Credential verification failed" }); }
    finally { setBusyProvider(null); }
  };

  const runAudit = async (providerId) => {
    setBusyProvider(`audit:${providerId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/gateway/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId, probeCount, contextSizes: contextSize ? [contextSize] : [] }) });
      const result = await response.json();
      if (!response.ok && !result.identity) throw new Error(result.error || "Endpoint audit failed");
      setMessage({ type: result.leakage?.passed === false || result.identity?.verdict === "inconsistent" ? "warning" : "success", text: `${providerId}: ${result.identity?.verdict || "unknown"}; upstream ${result.upstreamLatencyMs ?? "?"} ms; proxy overhead ${result.proxyOverheadMs ?? "?"} ms` });
      await refresh({ silent: true });
    } catch (error) { setMessage({ type: "error", text: error.message || "Endpoint audit failed" }); }
    finally { setBusyProvider(null); }
  };

  const exportConfiguration = () => { window.open("/api/gateway/config", "_blank"); };

  const importConfiguration = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const response = await fetch("/api/gateway/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Configuration import failed");
      setMessage({ type: "success", text: `Imported ${result.providers?.length || 0} providers and ${result.models?.length || 0} model catalogs into SQLite.` });
      await refresh({ silent: true });
    } catch (error) { setMessage({ type: "error", text: error.message || "Configuration import failed" }); }
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
  const supportedProviders = status?.supportedProviders || [];
  const configuredProviders = new Map(providers.map((provider) => [provider.id, provider]));
  const providerCategories = [
    { id: "oauth", title: "Official OAuth / device authorization", detail: "Use provider-published PKCE or device-code consent. One encrypted credential pool is kept per provider, with no browser-session conversion." },
    { id: "api", title: "Official API key / workload identity", detail: "Use API keys, provider-issued bearer tokens, service accounts, workload identities, or cloud credentials documented for API inference." },
    { id: "local", title: "Local / documented no-auth", detail: "Only local or self-operated services. No-auth is never used for third-party web applications." },
    { id: "custom", title: "Authorized custom endpoint", detail: "Requires an explicit compatible endpoint and its authorized credential." },
    { id: "catalog", title: "Catalog candidate / free-tier requires verification", detail: "A catalog label is not a free-access claim. Enable only an official free API or OAuth inference entitlement when the provider publishes one." },
  ].map((category) => ({ ...category, profiles: supportedProviders.filter((profile) => accessCategory(profile).id === category.id) })).filter((category) => category.profiles.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-text-main">Gateway</h1><Badge variant={status?.enabled ? "success" : "neutral"} size="sm" dot>{status?.enabled ? "Ready" : "Needs setup"}</Badge></div>
          <p className="text-sm text-text-muted mt-1">Authorized API providers, normalized for OpenAI-compatible clients.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" icon="download" onClick={exportConfiguration}>Export SQL config</Button><label className="inline-flex items-center"><input type="file" accept="application/json,.json" onChange={importConfiguration} className="hidden" /><span className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-text-main cursor-pointer hover:bg-surface-2"><span className="material-symbols-outlined text-[16px]">upload_file</span>Import SQL config</span></label><Button variant="outline" size="sm" icon="refresh" onClick={() => refresh()}>Refresh status</Button><Button variant="primary" size="sm" icon="add" onClick={() => setImportOpen((value) => !value)}>Add provider</Button></div>
      </div>

      {message && <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${message.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-300" : message.type === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-200" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"}`}><span className="material-symbols-outlined text-[18px]">{message.type === "error" ? "error" : message.type === "warning" ? "warning" : "check_circle"}</span><p>{message.text}</p></div>}

      {(status?.notifications || []).map((notice) => <div key={notice.id} className={`flex items-start gap-3 p-4 rounded-xl border ${notice.severity === "error" ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}><span className={`material-symbols-outlined ${notice.severity === "error" ? "text-red-300" : "text-amber-300"}`}>{notice.severity === "error" ? "error" : "schedule"}</span><div><p className="text-sm font-medium text-text-main">Provider attention required</p><p className="text-xs text-text-muted mt-1">{notice.message}</p></div></div>)}

      <Card title="Connection" icon="api" subtitle="Use this URL in OpenAI-compatible clients">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg border border-border"><code className="flex-1 text-sm font-mono text-text-main truncate">{baseUrl}</code><Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={copy}>{copied ? "Copied" : "Copy"}</Button></div>
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-text-muted"><div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>GET /v1/models</code><p className="mt-1">Lists enabled, non-expired provider models.</p></div><div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>POST /v1/chat/completions</code><p className="mt-1">Requires a dashboard-created Bearer key.</p></div></div>
      </Card>

      {importOpen && <Card title="Merge provider configuration" icon="upload_file" subtitle="Imports update matching IDs and keep all other configured providers. Secrets stay in server environment variables."><div className="space-y-3"><textarea value={importText} onChange={(event) => setImportText(event.target.value)} className="w-full min-h-[260px] rounded-xl border border-border bg-bg p-4 text-xs font-mono text-text-main focus:outline-none focus:ring-2 focus:ring-brand-500/30" spellCheck="false" /><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted"><p>Dedicated types: <code>openai</code>, <code>anthropic</code>, <code>gitlab</code>; Qwen, Kimi, and Grok use their official OpenAI-compatible APIs. OpenCode is local-only; GitLab is self-managed; Lovable and Kiro require explicit custom endpoints. HTTPS is required except for loopback development URLs. Credential values, cookies, and authorization headers are rejected.</p><Button variant="primary" size="sm" icon="file_download" loading={busyProvider === "import"} onClick={importProviders}>Merge configuration</Button></div></div></Card>}

      {importOpen && <Card title="Import authorized API-key pool" icon="key" subtitle="Keys are encrypted locally with GATEWAY_CREDENTIAL_MASTER_KEY and never returned after import."><div className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><input value={credentialProvider} onChange={(event) => setCredentialProvider(event.target.value)} placeholder="provider id, e.g. custom-api" className="rounded-xl border border-border bg-bg p-3 text-sm text-text-main" /><textarea value={credentialText} onChange={(event) => setCredentialText(event.target.value)} placeholder={'[{\"label\":\"primary\",\"apiKey\":\"...\"}] or [{\"label\":\"token\",\"token\":\"...\"}]'} className="min-h-[100px] rounded-xl border border-border bg-bg p-3 text-xs font-mono text-text-main" spellCheck="false" /></div><div className="flex items-center justify-between gap-2 text-xs text-text-muted"><div><p>Only user-owned API keys or official OAuth tokens. Cookies, passwords, and session tokens are rejected.</p><label className="inline-flex items-center gap-2 mt-2"><input type="checkbox" checked={verifyOnImport} onChange={(event) => setVerifyOnImport(event.target.checked)} /><span>Run health, TTFT, and canary verification after import</span></label></div><Button variant="primary" size="sm" icon="lock" loading={busyProvider === "credentials"} disabled={!credentialProvider || !credentialText} onClick={importCredentials}>Encrypt & import</Button></div></div></Card>}

      {(status?.supportedProviders || []).some((profile) => profile.authModes?.some((mode) => mode.includes("oauth"))) && <Card title="Official OAuth connections" icon="account_circle" subtitle="Uses provider-published consent only. Tokens are encrypted locally and browser cookies or sessions are never imported."><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{(status?.supportedProviders || []).filter((profile) => profile.authModes?.some((mode) => mode.includes("oauth"))).map((profile) => {
        const device = deviceAuthorizations[profile.id];
        const supportsDeviceCode = profile.authModes?.includes("oauth2-device-code") && profile.oauthDeviceCodeUrl;
        return <div key={`oauth-${profile.id}`} className="rounded-xl border border-border bg-bg p-3"><div className="flex items-center gap-3"><ProviderLogo provider={profile} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-text-main truncate">{profile.label}</p><p className="text-[11px] text-text-muted truncate">{profile.oauthStatus || "Official OAuth"}</p></div></div><p className="mt-3 text-[11px] text-text-subtle">{profile.status === "available" ? "Ready to begin provider consent." : profile.availabilityReason || "Client configuration is required before OAuth can start."}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" icon="login" loading={busyProvider === `oauth:${profile.id}`} onClick={() => connectOAuth(profile.id)}>Browser OAuth</Button>{supportsDeviceCode && <Button variant="outline" size="sm" icon="phonelink_lock" loading={busyProvider === `device:${profile.id}`} onClick={() => startDeviceAuthorization(profile.id)}>Device code</Button>}</div>{device && <div className="mt-3 rounded-lg border border-brand-500/25 bg-brand-500/10 p-3 text-xs text-text-main"><p>Enter code: <code className="font-bold tracking-wide">{device.userCode}</code></p><a href={device.verificationUriComplete || device.verificationUri} target="_blank" rel="noreferrer" className="mt-1 inline-block text-brand-300 underline">Open official verification page</a><div className="mt-2 flex items-center gap-2"><Button variant="outline" size="sm" icon="refresh" loading={busyProvider === `device:${profile.id}`} onClick={() => pollDeviceAuthorization(profile.id)}>Check connection</Button><span className="text-[11px] text-text-subtle">Expires in {Math.ceil((device.expiresIn || 0) / 60)} min</span></div></div>}</div>;
      })}</div></Card>}

      <Card title="Provider access catalog" icon="apps" subtitle="Choose access by the provider’s official authorization method. A “free” catalog entry is usable only where the provider exposes an official free API or OAuth inference entitlement."><div className="space-y-5">{providerCategories.map((category) => <section key={category.id}><div className="mb-2"><p className="text-sm font-semibold text-text-main">{category.title}</p><p className="text-xs text-text-muted mt-0.5">{category.detail}</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{category.profiles.map((profile) => {
        const configuredProvider = configuredProviders.get(profile.id);
        const modelList = [...new Set([...(profile.discoveredModels || []), ...(profile.models || [])])];
        const credentialCount = profile.credentialPool?.count || 0;
        const readyCredentials = profile.credentialPool?.ready || 0;
        const operations = profile.operations || {};
        const routing = routingBadge(operations);
        const accounts = operations.accounts || {};
        return <div key={profile.id} className="rounded-xl bg-bg border border-border p-3"><div className="flex items-start gap-3"><ProviderLogo provider={profile} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-medium text-text-main truncate">{profile.label}</p><span className={`h-1.5 w-1.5 rounded-full ${profile.status === "available" ? "bg-emerald-400" : "bg-amber-400"}`} title={profile.status === "available" ? "Configured" : "Setup required"} /></div><p className="text-[11px] text-text-muted mt-0.5">{profile.officialApi === true ? "Official API" : profile.officialApi === "self-managed-only" ? "Self-managed API" : profile.officialApi === "local-openapi" ? "Local OpenAPI" : "Authorized custom endpoint"}</p></div></div><div className="mt-3 space-y-1.5 text-[11px]"><div className="flex flex-wrap gap-1.5"><Badge variant={routing.variant} size="sm">{routing.label}</Badge><Badge variant={operations.active ? "success" : "neutral"} size="sm">{operations.active ? "Provider on" : "Provider off"}</Badge></div><p className={profile.status === "available" ? "text-emerald-300" : "text-amber-300"}>{profile.status === "available" ? (profile.localOnly ? "Available locally" : "Configured or OAuth client ready") : profile.catalogOnly ? "Catalog candidate · explicit setup required" : "Setup required"}</p><p className="text-text-subtle">Models: {modelList.length ? `${modelList.length} listed` : "discover after authorized setup"}</p>{modelList.length > 0 && <p className="font-mono text-text-muted line-clamp-2" title={modelList.join(", ")}>{modelList.slice(0, 5).join(" · ")}{modelList.length > 5 ? ` · +${modelList.length - 5}` : ""}</p>}<p className="text-text-subtle">Encrypted accounts: {credentialCount ? `${readyCredentials}/${credentialCount} ready` : "none imported"}</p>{credentialCount > 0 && <p className="text-text-subtle">Attention: {accounts.disabled || 0} off · {accounts.expired || 0} expired · {accounts.authRejected || 0} rejected · {accounts.rateLimited || 0} rate-limited · {accounts.quarantined || 0} quarantined</p>}<p className="text-text-subtle" title={operations.quotaTelemetry?.note || ""}>External quota: {operations.quotaTelemetry?.status === "available" ? "official telemetry available" : "not exposed by this provider"}</p><p className="text-text-subtle line-clamp-2" title={operations.routingReason}>{operations.routingReason}</p>{profile.authModes?.length > 0 && <p className="text-text-subtle line-clamp-2">Auth: {profile.authModes.join(" · ")}</p>}<p className="text-text-subtle line-clamp-2" title={profile.availabilityNote || profile.availabilityReason}>{profile.availabilityNote || profile.availabilityReason}</p></div>{configuredProvider && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" icon={operations.active ? "pause_circle" : "play_circle"} loading={busyProvider === profile.id} onClick={() => setEnabled(configuredProvider, !operations.active)}>{operations.active ? "Turn off" : "Turn on"}</Button><Button variant="outline" size="sm" icon="sync" loading={busyProvider === profile.id} onClick={() => refreshProvider(profile.id)}>Test & import models</Button>{credentialCount > 0 && <Button variant="outline" size="sm" icon="verified" loading={busyProvider === `credentials:${profile.id}`} onClick={() => verifyCredentialPool(profile.id)}>Verify credentials</Button>}</div>}</div>;
      })}</div></section>)}</div></Card>

      <Card title="Authorized providers" icon="hub" subtitle="Validate credentials with a documented model-list request, then selectively enable each provider.">
        <div className="flex justify-end mb-3"><Button variant="outline" size="sm" icon="sync" loading={busyProvider === "all"} disabled={providers.length === 0} onClick={() => refreshProvider()}>Refresh all models</Button></div>
        {providers.length === 0 ? <div className="text-center py-8"><span className="material-symbols-outlined text-3xl text-text-subtle">settings_suggest</span><p className="text-sm text-text-muted mt-3">No provider is configured yet.</p><p className="text-xs text-text-subtle mt-1">Add a provider config, set its API key in the server environment, then run a model refresh.</p></div> : <div className="grid lg:grid-cols-2 gap-3">{providers.map((provider) => {
          const badge = healthBadge(provider);
          const modelCount = provider.models?.length || provider.catalogModelCount || 0;
          return <div key={provider.id} className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/25 transition-colors"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-text-main truncate">{provider.label}</p><p className="text-xs font-mono text-text-subtle mt-0.5 truncate">{provider.id} · {provider.type} · {provider.credentialPool?.count || 0} key{provider.credentialPool?.count === 1 ? "" : "s"}</p></div><Badge variant={badge.variant} size="sm">{badge.label}</Badge></div><div className="flex flex-wrap gap-2 mt-4"><Capability enabled={provider.supportsTools} icon="build" label={provider.supportsTools ? "Native tools" : "Tool bridge"} /><Capability enabled={provider.supportsVision || provider.visionProvider} icon="image" label={provider.supportsVision ? "Native vision" : provider.visionProvider ? "Vision fallback" : "Text only"} /><Capability enabled={modelCount > 0} icon="model_training" label={`${modelCount} model${modelCount === 1 ? "" : "s"}`} /></div><div className="mt-3 space-y-1 text-xs text-text-muted"><p>Default: <span className="font-mono text-text-main">{provider.defaultModel || "discover on refresh"}</span></p>{provider.authModes?.length > 0 && <p>Auth: <span className="text-text-main">{provider.authModes.join(" · ")}</span></p>}{provider.oauthStatus && <p className="text-amber-300">OAuth: {provider.oauthStatus === "discontinued-2026-04-15" ? "legacy flow discontinued; use an API key" : provider.oauthStatus}</p>}<p>Last check: {provider.health?.checkedAt ? new Date(provider.health.checkedAt).toLocaleString() : "not yet checked"}{provider.health?.latencyMs ? ` · ${provider.health.latencyMs} ms` : ""}</p>{provider.health?.message && <p className="text-amber-300">{provider.health.message}</p>}</div><div className="flex flex-wrap gap-2 mt-4"><Button variant="outline" size="sm" icon="sync" loading={busyProvider === provider.id} onClick={() => refreshProvider(provider.id)}>Test & refresh</Button><Button variant="outline" size="sm" icon="verified" loading={busyProvider === `credentials:${provider.id}`} disabled={!provider.credentialPool?.count} onClick={() => verifyCredentialPool(provider.id)}>Verify key pool</Button><Button variant={provider.enabled ? "ghost" : "primary"} size="sm" icon={provider.enabled ? "pause_circle" : "play_circle"} loading={busyProvider === provider.id} onClick={() => setEnabled(provider, !provider.enabled)}>{provider.enabled ? "Disable" : "Enable"}</Button></div>{credentialResults[provider.id]?.length > 0 && <div className="mt-3 space-y-1.5">{credentialResults[provider.id].map((item) => <div key={item.credentialId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-2 text-[11px]"><span className="font-mono text-text-subtle truncate">{item.credentialId.slice(0, 8)}…</span><span className={item.status === "verified" ? "text-emerald-300" : item.status === "quarantined" ? "text-red-300" : "text-amber-300"}>{item.status} · {item.authenticityScore == null ? "?" : `${Math.round(item.authenticityScore * 100)}%`} · TTFT {item.ttftMs ?? "?"} ms</span></div>)}</div>}</div>;
        })}</div>}
      </Card>

      <Card title="Endpoint audit" icon="policy" subtitle="Non-invasive evidence checks for advertised model identity, prompt-leak indicators, routing headers, and split latency."><div className="space-y-3">{providers.length === 0 ? <p className="text-sm text-text-muted">Configure a provider before running an audit.</p> : providers.map((provider) => { const badge = auditBadge(provider.audit); return <div key={provider.id} className="p-4 rounded-xl bg-bg border border-border"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-text-main">{provider.label}</p><p className="text-xs text-text-muted mt-1">Advertised: <span className="font-mono text-text-main">{provider.audit?.advertisedModel || provider.defaultModel || "not configured"}</span></p></div><Badge variant={badge.variant} size="sm">{badge.label}</Badge></div>{provider.audit ? <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3 text-xs"><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Reported</span><p className="font-mono text-text-main truncate">{provider.audit.identity?.reportedModel || "not reported"}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Leak indicators</span><p className={provider.audit.leakage?.passed ? "text-emerald-300" : "text-red-300"}>{provider.audit.leakage?.passed ? "None detected" : provider.audit.leakage?.findings?.join(", ")}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Upstream</span><p className="text-text-main">{provider.audit.upstreamLatencyMs ?? "?"} ms</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Proxy overhead</span><p className={provider.audit.proxyOverheadUnderTarget ? "text-emerald-300" : "text-amber-300"}>{provider.audit.proxyOverheadMs ?? "?"} ms / target &lt;1 ms</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Authenticity</span><p className={provider.audit.authenticity?.status === "quarantined" ? "text-red-300" : provider.audit.authenticity?.status === "suspicious" ? "text-amber-300" : "text-emerald-300"}>{provider.audit.authenticity ? `${Math.round((provider.audit.authenticity.score || 0) * 100)}% · ${provider.audit.authenticity.status}` : "not scored"}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">TTFT</span><p className="text-text-main">{provider.audit.authenticity?.ttftMs ?? "?"} ms</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Canaries / context</span><p className="text-text-main">{provider.audit.authenticity?.failedCanaries || 0} failed · {provider.audit.authenticity?.failedContexts || 0} context failed</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Behavior</span><p className="text-text-main">{provider.audit.behavioral?.probeCount || 0} probes · {provider.audit.behavioral?.sentinelMatched ? "sentinel matched" : "sentinel mismatch"}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Tool capability</span><p className={provider.audit.behavioral?.toolCallObserved ? "text-emerald-300" : "text-text-main"}>{provider.audit.behavioral?.toolCallObserved ? "tool call observed" : "not observed"}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Transport</span><p className="text-text-main truncate">{provider.audit.forensics?.transport?.intermediaryMarkers?.join(", ") || "direct markers not observed"}</p></div><div className="p-2 rounded-lg bg-surface-2/50"><span className="text-text-subtle">Forensic status</span><p className={provider.audit.forensics?.intermediarySuspected ? "text-amber-300" : "text-emerald-300"}>{provider.audit.forensics?.intermediarySuspected ? "intermediary signal" : "no known marker"}</p></div></div> : <p className="text-xs text-text-muted mt-3">No audit stored. This check sends a bounded exact-token probe and stores only metadata.</p>}<div className="flex flex-wrap items-center justify-between gap-3 mt-3"><p className="text-[11px] text-text-subtle">Black-box checks provide evidence, not proof of hidden backend identity.</p><div className="flex items-center gap-2"><label className="text-[11px] text-text-muted" htmlFor={`probe-count-${provider.id}`}>Probes</label><select id={`probe-count-${provider.id}`} value={probeCount} onChange={(event) => setProbeCount(Number(event.target.value))} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-main"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={5}>5</option></select><label className="text-[11px] text-text-muted" htmlFor={`context-size-${provider.id}`}>Context</label><select id={`context-size-${provider.id}`} value={contextSize} onChange={(event) => setContextSize(Number(event.target.value))} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-main"><option value={0}>Off</option><option value={8000}>8k</option><option value={32000}>32k</option><option value={64000}>64k</option></select><Button variant="outline" size="sm" icon="policy" loading={busyProvider === `audit:${provider.id}`} disabled={!provider.configured} onClick={() => runAudit(provider.id)}>Run audit</Button></div></div></div>; })}</div></Card>

      <Card title="Daily model refresh" icon="update" subtitle="Model discovery is explicit, bounded, and does not scrape browser sessions."><div className="grid md:grid-cols-2 gap-3 text-sm"><div className="p-4 rounded-xl bg-surface-2/50 border border-border"><p className="font-medium text-text-main">Manual or deployment scheduler</p><p className="text-xs text-text-muted mt-1">Run the refresh command once daily through your server’s scheduled-task facility. This is the lightest option and uses no always-on job process.</p><code className="block mt-3 p-2 rounded bg-bg border border-border text-[11px]">npm run gateway:refresh-models</code></div><div className="p-4 rounded-xl bg-surface-2/50 border border-border"><p className="font-medium text-text-main">Dashboard-triggered refresh</p><p className="text-xs text-text-muted mt-1">Use “Refresh all models” after changing provider permissions or models. The result records health, latency, and a bounded model catalog.</p><p className="text-xs text-text-subtle mt-3">Last full refresh: {status?.lastRefreshAt ? new Date(status.lastRefreshAt).toLocaleString() : "never"}</p></div></div></Card>

      <Card title="Compatibility controls" icon="verified_user" subtitle="Predictable boundaries for authorized integrations"><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[["Client-managed tools", "Non-tool models return validated tool-call objects; the client executes them.", "handyman"], ["Vision fallback", "A configured vision API can describe bounded inline images for a text-only model.", "visibility"], ["Provider health", "Credential validity and model discovery use provider model-list endpoints.", "monitor_heart"], ["Authorized key failover", "User-owned API keys can rotate with cooldowns; cookies, sessions, and account scraping are not used.", "shield"]].map(([title, detail, icon]) => <div key={title} className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="material-symbols-outlined text-brand-400">{icon}</span><p className="text-sm font-medium text-text-main mt-2">{title}</p><p className="text-xs leading-relaxed text-text-muted mt-1">{detail}</p></div>)}</div></Card>
    </div>
  );
}
