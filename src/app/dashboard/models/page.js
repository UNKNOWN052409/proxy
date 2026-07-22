"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Skeleton } from "@/components/shared";
import { cn } from "@/lib/cn";

// Provider color map
const providerColors = {
  kiro: { bg: "bg-brand-500/10", text: "text-brand-400", border: "border-brand-500/20" },
  opencode: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  codex: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  antigravity: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  gemini: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  github: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  openrouter: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  grok: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  groq: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  deepseek: { bg: "bg-fuchsia-500/10", text: "text-fuchsia-400", border: "border-fuchsia-500/20" },
  qwen: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  perplexity: { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  cohere: { bg: "bg-lime-500/10", text: "text-lime-400", border: "border-lime-500/20" },
  mistral: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20" },
  huggingface: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20" },
  ollama: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20" },
  lmstudio: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  "github-copilot": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "azure-openai": { bg: "bg-blue-600/10", text: "text-blue-600", border: "border-blue-600/20" },
  "vertex-ai": { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
};

const defaultColor = { bg: "bg-surface-2", text: "text-text-muted", border: "border-border" };

export default function ModelsPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.data || []);
        // Extract unique providers
        const provs = [...new Set((data.data || []).map(m => m.owned_by))];
        setProviders(provs);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    } finally {
      setLoading(false);
    }
  };

  const refreshModels = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/models/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: null }), // null = refresh all
      });
      if (res.ok) {
        await fetchModels();
      }
    } catch (e) {
      console.error("Failed to refresh models:", e);
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = models.filter(m => {
    if (!search && providerFilter === "all") return true;
    const q = search.toLowerCase();
    const matchesSearch = !search || m.id.toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q);
    const matchesProvider = providerFilter === "all" || m.owned_by === providerFilter;
    return matchesSearch && matchesProvider;
  });

  const hasThinking = (id) => id.includes("thinking");
  const hasAgentic = (id) => id.includes("agentic");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Models</h1>
        <p className="text-text-muted text-sm mt-1">Browse all available AI models from every provider</p>
      </div>

      {/* Search + Filter + Refresh */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </span>
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-surface border border-border text-text-main text-sm placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/30 transition-all"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-10 px-3 rounded-xl bg-surface border border-border text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All Providers</option>
          {providers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={refreshModels}
          disabled={refreshing}
          className="h-10 px-4 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
        >
          <span className={`material-symbols-outlined text-[18px] ${refreshing ? 'animate-spin' : ''}`}>
            {refreshing ? 'progress_activity' : 'refresh'}
          </span>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} variant="card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-text-muted">No models found matching &quot;{search}&quot;</p>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((model) => {
            const colors = providerColors[model.owned_by] || defaultColor;
            return (
              <div
                key={model.id}
                className={cn(
                  "p-4 rounded-xl bg-surface border border-border-subtle",
                  "hover:border-brand-500/20 hover:shadow-[var(--shadow-warm)]",
                  "transition-all duration-200"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("size-8 rounded-lg flex items-center justify-center", colors.bg)}>
                      <span className={cn("material-symbols-outlined text-[18px]", colors.text)}>model_training</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-main truncate">{model.id}</p>
                      <p className="text-[10px] text-text-subtle">{model.owned_by}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {model.context_length && (
                    <Badge variant="brand" size="sm">
                      {(model.context_length / 1000).toFixed(0)}k ctx
                    </Badge>
                  )}
                  {hasThinking(model.id) && <Badge variant="info" size="sm">thinking</Badge>}
                  {hasAgentic(model.id) && <Badge variant="warning" size="sm">agentic</Badge>}
                </div>
                {model.description && (
                  <p className="text-xs text-text-muted mt-2">{model.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-text-subtle">{filtered.length} model(s) available</p>
      </div>
    </div>
  );
}
