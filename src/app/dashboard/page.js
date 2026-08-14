"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Skeleton } from "@/components/shared";
import TimePeriodSelector from "@/components/shared/TimePeriodSelector";
import { formatNumber, TIME_PERIODS } from "@/lib/utils/format";

export default function DashboardHome() {
  const [accounts, setAccounts] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [endpointHealth, setEndpointHealth] = useState("checking");
  const [timePeriod, setTimePeriod] = useState("7d"); // Default to 7 days

  const endpointUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:2018`
    : "http://localhost:2018";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/accounts").then(r => r.json()),
      fetch(`/api/usage?period=${timePeriod}`).then(r => r.json()),
    ])
      .then(([acctData, usageData]) => {
        setAccounts(acctData.accounts || []);
        setUsage(usageData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [timePeriod]);

  const copyEndpoint = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeAccounts = accounts.filter(a => a.active).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" />)}
        </div>
        <Skeleton variant="card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Dashboard</h1>
          <p className="text-text-muted text-sm mt-1">Kiro AI Proxy — your unified AI endpoint</p>
        </div>
        <TimePeriodSelector value={timePeriod} onChange={setTimePeriod} />
      </div>

      {/* Status Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px] text-brand-400">key</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-main">{formatNumber(activeAccounts)}</p>
              <p className="text-xs text-text-muted">Active Accounts</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px] text-emerald-400">model_training</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-main">{formatNumber(accounts.length)}</p>
              <p className="text-xs text-text-muted">Total Accounts</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px] text-amber-400">bar_chart</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-main">{formatNumber(usage?.total || 0)}</p>
              <p className="text-xs text-text-muted">Total Requests</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px] text-cyan-400">schedule</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-main">{formatNumber(usage?.last24h || 0)}</p>
              <p className="text-xs text-text-muted">Last 24h</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Endpoint */}
      <Card title="Your Endpoint" icon="link" subtitle="Use this URL in any OpenAI-compatible client">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg border border-border">
          <code className="flex-1 text-sm font-mono text-text-main truncate">{endpointUrl}</code>
          <Button variant="outline" size="sm" onClick={copyEndpoint}>
            {copied ? "Copied!" : "Copy"}
          </Button>
          <a href="/dashboard/endpoint">
            <Button variant="ghost" size="sm" icon="settings">Configure</Button>
          </a>
        </div>
      </Card>

      {/* Quick Actions */}
      <Card title="Quick Actions" icon="bolt" subtitle="Common tasks">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/dashboard/import" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">file_download</span>
            <p className="text-xs text-text-main font-medium">Import</p>
          </a>
          <a href="/dashboard/accounts" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">manage_accounts</span>
            <p className="text-xs text-text-main font-medium">Accounts</p>
          </a>
          <a href="/dashboard/models" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">model_training</span>
            <p className="text-xs text-text-main font-medium">Models</p>
          </a>
          <a href="/dashboard/endpoint" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">settings</span>
            <p className="text-xs text-text-main font-medium">Endpoint</p>
          </a>
        </div>
      </Card>

      {/* Daily Usage Chart (simple bar chart) */}
      {usage?.daily?.length > 0 && (
        <Card title="Daily Usage (Last 30 Days)" icon="bar_chart" subtitle="Requests per day">
          <div className="space-y-3">
            {/* Simple bar chart */}
            <div className="flex items-end gap-1 h-24">
              {usage.daily.map((day, i) => {
                const maxCount = Math.max(...usage.daily.map(d => d.count), 1);
                const height = (day.count / maxCount) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full rounded-t bg-brand-500/30 hover:bg-brand-500/50 transition-all cursor-pointer min-h-[2px]"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${day.date}: ${day.count} requests`}
                    />
                    {usage.daily.length <= 14 && (
                      <span className="text-[8px] text-text-subtle whitespace-nowrap">
                        {day.date.slice(5)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Stats summary */}
            <div className="flex flex-wrap gap-4 text-xs text-text-muted">
              <span>Total: <strong className="text-text-main">{formatNumber(usage.total)}</strong></span>
              <span>Successful: <strong className="text-emerald-400">{formatNumber(usage.successful)}</strong></span>
              <span>Failed: <strong className="text-red-400">{formatNumber(usage.failed)}</strong></span>
              <span>Tokens: <strong className="text-text-main">{formatNumber(usage.totalTokens || 0)}</strong></span>
              <span>Avg. latency: <strong className="text-text-main">{formatNumber(usage.averageLatencyMs || 0)} ms</strong></span>
              <span>Success rate: <strong className="text-emerald-400">{Math.round((usage.successRate || 0) * 100)}%</strong></span>
            </div>
          </div>
        </Card>
      )}

      {/* Provider Reliability */}
      {usage?.providers && Object.keys(usage.providers).length > 0 && (
        <Card title="Provider Reliability" icon="monitor_heart" subtitle="Gateway request health and latency by provider">
          <div className="space-y-2">
            {Object.entries(usage.providers)
              .sort(([, a], [, b]) => b.count - a.count)
              .slice(0, 8)
              .map(([provider, stats]) => (
                <div key={provider} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3 rounded-lg bg-bg">
                  <div className="min-w-0">
                    <p className="text-sm text-text-main truncate">{provider}</p>
                    <p className="text-[11px] text-text-subtle">{formatNumber(stats.count)} request{stats.count === 1 ? "" : "s"} · {formatNumber(stats.tokens)} tokens</p>
                  </div>
                  <span className={`text-xs font-medium ${stats.successRate >= 0.98 ? "text-emerald-400" : stats.successRate >= 0.9 ? "text-amber-300" : "text-red-400"}`}>{Math.round(stats.successRate * 100)}% success</span>
                  <span className="text-xs text-text-muted tabular-nums">{formatNumber(stats.averageLatencyMs)} ms</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Top Models */}
      {usage?.models && Object.keys(usage.models).length > 0 && (
        <Card title="Top Models" icon="model_training" subtitle="Most used models">
          <div className="space-y-2">
            {Object.entries(usage.models)
              .sort(([, a], [, b]) => b.count - a.count)
              .slice(0, 10)
              .map(([model, stats]) => (
                <div key={model} className="flex items-center justify-between p-2 rounded-lg bg-bg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-brand-400 shrink-0">model_training</span>
                    <span className="text-sm text-text-main truncate">{model}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-muted">{formatNumber(stats.count)} req</span>
                    <span className="text-xs text-text-subtle">{formatNumber(stats.tokens)} tok</span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Recent Accounts */}
      <Card title="Recent Accounts" icon="manage_accounts" subtitle="Your imported accounts">
        <div className="space-y-2">
          {accounts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-text-muted text-sm mb-4">No accounts yet</p>
              <a href="/dashboard/import">
                <Button variant="primary" size="sm" icon="file_download">Import Accounts</Button>
              </a>
            </div>
          ) : (
            accounts.slice(0, 5).map(acct => (
              <div key={acct.id} className="flex items-center justify-between p-2 rounded-lg bg-bg">
                <div className="flex items-center gap-2">
                  <Badge variant={acct.active ? "success" : "error"} size="sm" dot />
                  <span className="text-sm text-text-main">{acct.label || acct.email || acct.id?.slice(0, 8)}</span>
                </div>
                <span className="text-xs text-text-muted">{acct.provider || "kiro"}</span>
              </div>
            ))
          )}
          {accounts.length > 5 && (
            <a href="/dashboard/accounts" className="block text-center text-xs text-brand-400 hover:text-brand-300 pt-2">
              View all {accounts.length} accounts →
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}
