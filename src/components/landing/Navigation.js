"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full bg-[#111118]/80 backdrop-blur-xl border-b border-[#2e2e42]/50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <span className="material-symbols-outlined text-[20px] text-white">bolt</span>
          </div>
          <h2 className="text-white text-xl font-bold tracking-tight">
            Kiro <span className="text-brand-400">Proxy</span>
          </h2>
        </Link>

        {/* Desktop menu */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Features</a>
          <a href="#how-it-works" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">How it Works</a>
          <a href="#models" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Models</a>
          <a href="/dashboard" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Dashboard</a>
        </div>

        {/* CTA + Mobile */}
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="hidden sm:flex h-9 items-center justify-center rounded-lg px-5 bg-brand-500 hover:bg-brand-600 transition-all text-white text-sm font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50"
          >
            Get Started
          </Link>
          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            <span className="material-symbols-outlined">{mobileOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#2e2e42]/50 bg-[#111118]/95 backdrop-blur-xl">
          <div className="flex flex-col gap-4 p-6">
            <a href="#features" className="text-gray-400 hover:text-white text-sm font-medium" onClick={() => setMobileOpen(false)}>Features</a>
            <a href="#how-it-works" className="text-gray-400 hover:text-white text-sm font-medium" onClick={() => setMobileOpen(false)}>How it Works</a>
            <a href="#models" className="text-gray-400 hover:text-white text-sm font-medium" onClick={() => setMobileOpen(false)}>Models</a>
            <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm font-medium" onClick={() => setMobileOpen(false)}>Dashboard</Link>
            <Link
              href="/dashboard"
              className="h-9 flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
