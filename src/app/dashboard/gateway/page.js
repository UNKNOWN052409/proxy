"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/shared";

function Capability({ enabled, icon, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border ${enabled ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-text-subtle bg-surface border-border"}`}>
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </span>
  );
}

export default function GatewayPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const baseUrl = useMemo(() => typeof window === "undefined" ? "http://localhost:20127/v1" : `${window.location.origin}/v1`, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/gateway/status", { cache: "no-store" });
      setStatus(await response.json());
    } catch (error) {
      setStatus({ success: false, error: error.message, providers: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const copy = async (value) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (loading) return <div className="space-y-6"><Skeleton variant="card" /><Skeleton variant="card" /><Skeleton variant="card" /></div>;

  const providers = status?.providers || [];
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-main">Gateway</h1>
            <Badge variant={status?.enabled ? "success" : "neutral"} size="sm" dot>{status?.enabled ? "Configured" : "Needs setup"}</Badge>
          </div>
          <p className="text-sm text-text-muted mt-1">A standards-compliant OpenAI-compatible endpoint for authorized provider APIs.</p>
        </div>
        <Button variant="outline" size="sm" icon="refresh" onClick={refresh}>Refresh status</Button>
      </div>

      <Card title="Connection" icon="api" subtitle="Use this endpoint in OpenAI-compatible clients">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg border border-border">
          <code className="flex-1 text-sm font-mono text-text-main truncate">{baseUrl}</code>
          <Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={() => copy(baseUrl)}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-text-muted">
          <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>GET /v1/models</code><p className="mt-1">Lists only enabled gateway models.</p></div>
          <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><code>POST /v1/chat/completions</code><p className="mt-1">Requires a dashboard-created Bearer key.</p></div>
        </div>
      </Card>

      {status?.configurationError || status?.error ? (
        <Card padding="sm">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <span className="material-symbols-outlined text-amber-400">warning</span>
            <div>
              <p className="text-sm font-medium text-amber-300">Configuration needs attention</p>
              <p className="text-xs text-text-muted mt-1">{status.configurationError || status.error}</p>
              <p className="text-xs text-text-subtle mt-2">Set provider configuration through server environment variables. Provider secrets are never exposed in this dashboard.</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Enabled Providers" icon="hub" subtitle="Only explicitly configured, authorized API integrations are displayed">
        {providers.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-3xl text-text-subtle">settings_suggest</span>
            <p className="text-sm text-text-muted mt-3">No gateway providers are configured yet.</p>
            <p className="text-xs text-text-subtle mt-1">Add server-side provider settings, then refresh this page.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {providers.map((provider) => (
              <div key={provider.id} className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/25 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-main">{provider.label}</p>
                    <p className="text-xs font-mono text-text-subtle mt-0.5">{provider.id}</p>
                  </div>
                  <Badge variant={provider.configured ? "success" : "error"} size="sm">{provider.configured ? "Ready" : "Secret missing"}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Capability enabled={provider.supportsTools} icon="build" label={provider.supportsTools ? "Native tools" : "Client-managed tools"} />
                  <Capability enabled={provider.supportsVision || provider.visionProvider} icon="image" label={provider.supportsVision ? "Native vision" : provider.visionProvider ? "Vision fallback" : "Text only"} />
                  <Capability enabled={provider.modelsConfigured > 0} icon="model_training" label={`${provider.modelsConfigured} model${provider.modelsConfigured === 1 ? "" : "s"}`} />
                </div>
                <p className="text-xs text-text-muted mt-3 truncate">Default: <span className="font-mono text-text-main">{provider.defaultModel || "not set"}</span></p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Compatibility Controls" icon="verified_user" subtitle="Built-in boundaries for predictable, safer integrations">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ["Client-managed tools", "For non-tool models, the gateway returns validated tool-call objects to your client. It does not execute arbitrary tools.", "handyman"],
            ["Vision fallback", "Images can be described by a configured vision model before reaching a text-only model.", "visibility"],
            ["No remote image fetch", "Only bounded inline image data is accepted for the vision fallback.", "image_not_supported"],
            ["No session interception", "Browser cookies, session conversion, and traffic interception are not gateway features.", "shield"],
          ].map(([title, detail, icon]) => (
            <div key={title} className="p-3 rounded-lg bg-surface-2/50 border border-border">
              <span className="material-symbols-outlined text-brand-400">{icon}</span>
              <p className="text-sm font-medium text-text-main mt-2">{title}</p>
              <p className="text-xs leading-relaxed text-text-muted mt-1">{detail}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
