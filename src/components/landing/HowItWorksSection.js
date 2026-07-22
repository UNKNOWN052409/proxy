"use client";

import Link from "next/link";

export default function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Add Your First Account",
      description: "Import from 9Router, Kiro IDE, or paste credentials directly. Your accounts stay local and private.",
      icon: "add_circle",
    },
    {
      num: "02",
      title: "Connect Your Tools",
      description: "Point Claude Code, Codex, Cursor, Cline, or any OpenAI-compatible tool to the local endpoint.",
      icon: "link",
    },
    {
      num: "03",
      title: "Choose Your Model",
      description: "Pick from 50+ models — Claude Opus, Sonnet, GPT-5.6, DeepSeek, and more. All free, all unlimited.",
      icon: "model_training",
    },
    {
      num: "04",
      title: "Start Coding Free",
      description: "No subscriptions, no rate limits, no token counting. Just unlimited AI assistance.",
      icon: "rocket_launch",
    },
  ];

  return (
    <section id="how-it-works" className="relative py-24 px-6">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/[0.02] to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Get started in 4 simple steps. No credit card, no signup required.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative group">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden sm:block absolute top-8 left-[calc(100%+8px)] w-[calc(100%-16px)] h-px bg-gradient-to-r from-brand-500/30 to-transparent" style={{ display: i % 2 === 0 ? 'block' : 'none' }} />
              )}

              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] group-hover:bg-white/[0.06] group-hover:border-brand-500/20 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 size-12 rounded-xl bg-brand-500/10 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                    <span className="material-symbols-outlined text-[24px] text-brand-400">{step.icon}</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-brand-500/60 mb-1 block">{step.num}</span>
                    <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-xl px-6 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm shadow-lg shadow-brand-500/20 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            Get Started Now
          </Link>
        </div>
      </div>
    </section>
  );
}
