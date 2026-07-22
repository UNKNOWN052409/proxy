"use client";

export default function FeaturesSection() {
  const features = [
    {
      icon: "bolt",
      title: "OpenAI Compatible",
      description: "Drop-in replacement for any OpenAI API client. Works with Claude Code, Codex, Cursor, Cline, OpenClaw, and 50+ tools.",
    },
    {
      icon: "account_balance",
      title: "Import Accounts",
      description: "Import existing Kiro accounts from 9Router, Kiro IDE, or any proxy. Multiple imports accumulate — never lose your accounts.",
    },
    {
      icon: "model_training",
      title: "50+ AI Models",
      description: "Claude Opus 4.8, Claude Sonnet 5, GPT-5.6 Sol/Terra/Luna, DeepSeek 3.2, Qwen3 Coder, GLM 5, MiniMax M2.5, and more.",
    },
    {
      icon: "shield",
      title: "Multiple Auth Methods",
      description: "Support for AWS Builder ID, IAM Identity Center, Google, GitHub, API Keys, Microsoft Entra ID — all in one place.",
    },
    {
      icon: "stream",
      title: "Streaming SSE",
      description: "Full streaming support via Server-Sent Events. Real-time responses with no buffering. Works with all major AI coding tools.",
    },
    {
      icon: "devices",
      title: "Works Everywhere",
      description: "Local proxy runs on your machine. Connect any tool by pointing it to http://localhost:20127/v1. No cloud dependency.",
    },
    {
      icon: "sync",
      title: "Accumulative Imports",
      description: "Import accounts from multiple sources. Each import adds to your existing accounts. No duplicates, no overwrites.",
    },
    {
      icon: "palette",
      title: "Beautiful UI",
      description: "Dark/light theme, smooth animations, responsive design. A dashboard you'll actually enjoy using.",
    },
  ];

  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            A complete proxy solution for Kiro AI with features designed for developers.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-brand-500/20 transition-all duration-300"
            >
              <div className="size-10 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                <span className="material-symbols-outlined text-[22px] text-brand-400">{f.icon}</span>
              </div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
