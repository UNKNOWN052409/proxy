"use client";

import Link from "next/link";
import { useTheme } from "@/components/shared/ThemeProvider";

export default function HeroSection() {
  const { isDark } = useTheme();

  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(to right, #5B52F5 1px, transparent 1px), linear-gradient(to bottom, #5B52F5 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[120px] animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-accent-500/8 rounded-full blur-[120px] animate-blob" style={{ animationDelay: '2s', animationDuration: '22s' }} />
        <div className="absolute bottom-0 left-1/2 w-[550px] h-[550px] bg-blue-500/6 rounded-full blur-[120px] animate-blob" style={{ animationDelay: '4s', animationDuration: '25s' }} />
      </div>

      {/* Content */}
      <div className="relative max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm mb-8 animate-fadeIn">
          <span className="material-symbols-outlined text-[16px]">bolt</span>
          Free AI Proxy — OpenAI Compatible
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight mb-6 animate-slideUp">
          Kiro AI at Your{" "}
          <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">Fingertips</span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 animate-slideUp" style={{ animationDelay: '0.1s' }}>
          Free, unlimited access to Claude Opus, Sonnet, GPT-5.6, DeepSeek, and more.
          One OpenAI-compatible endpoint for all your AI tools.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slideUp" style={{ animationDelay: '0.2s' }}>
          <Link
            href="/dashboard"
            className="h-12 px-8 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-base shadow-xl shadow-brand-500/30 hover:shadow-brand-500/50 transition-all inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
            Get Started Free
          </Link>
          <a
            href="#how-it-works"
            className="h-12 px-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 font-medium text-base border border-white/10 transition-all inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
            See How It Works
          </a>
        </div>

        {/* Quick stats */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
          {[
            { value: "50+", label: "Models Available" },
            { value: "Free", label: "No Subscription" },
            { value: "OpenAI", label: "Compatible API" },
            { value: "Privacy", label: "Local Proxy" },
          ].map((stat, i) => (
            <div key={i} className="text-center animate-slideUp" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
