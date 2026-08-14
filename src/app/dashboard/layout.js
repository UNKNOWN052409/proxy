"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/shared/ThemeProvider";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/dashboard/accounts", icon: "key", label: "Accounts" },
  { href: "/dashboard/models", icon: "model_training", label: "Models" },
  { href: "/dashboard/gateway", icon: "hub", label: "Gateway" },
  { href: "/dashboard/endpoint", icon: "api", label: "Endpoint" },
  { href: "/dashboard/import", icon: "file_download", label: "Import" },
  { href: "/dashboard/settings", icon: "settings", label: "Settings" },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(null);

  useEffect(() => {
    // Check auth
    fetch("/api/config/auth/check")
      .then(r => r.json())
      .then(data => {
        if (data.hasPassword && !data.authenticated) {
          router.replace("/login");
        } else {
          setAuthChecked(true);
        }
      })
      .catch(() => setAuthChecked(true));

    // Get tunnel status
    fetch("/api/config/tunnel")
      .then(r => r.json())
      .then(data => {
        if (data.enabled && data.url) setTunnelUrl(data.url);
      })
      .catch(() => {});
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="size-8 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-border backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-border-subtle">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <span className="material-symbols-outlined text-[20px] text-white">bolt</span>
              </div>
              <div>
                <h2 className="text-text-main font-bold text-sm">AI Gateway</h2>
                <p className="text-text-subtle text-[10px]">standards-compatible</p>
              </div>
            </Link>
          </div>

          {/* Tunnel status badge */}
          {tunnelUrl && (
            <div className="px-3 pt-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-emerald-400 font-medium truncate">Live</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                      : "text-text-muted hover:text-text-main hover:bg-surface-2/50 border border-transparent"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border-subtle space-y-2">
            {tunnelUrl && (
              <a
                href={tunnelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">public</span>
                {tunnelUrl.replace("https://", "").replace("http://", "")}
              </a>
            )}
            <Link href="/" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-main transition-colors">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Back to Home
            </Link>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-sidebar/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-text-muted hover:text-text-main" onClick={() => setSidebarOpen(true)}>
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              {tunnelUrl ? "Public" : "Local"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tunnel URL quick copy */}
            {tunnelUrl && (
              <button
                onClick={() => { navigator.clipboard.writeText(tunnelUrl); }}
                className="hidden md:flex h-8 items-center gap-1.5 px-3 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                title="Copy tunnel URL"
              >
                <span className="material-symbols-outlined text-[14px]">public</span>
                {tunnelUrl.replace("https://", "").replace("http://", "").slice(0, 30)}
              </button>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">{isDark ? "light_mode" : "dark_mode"}</span>
            </button>

            {/* Quick endpoint link */}
            <a
              href="http://localhost:2018"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex h-8 items-center gap-1.5 px-3 rounded-lg bg-brand-500/10 text-brand-400 text-xs font-medium border border-brand-500/20 hover:bg-brand-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              localhost:2018
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
