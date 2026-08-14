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
      description: "Import authorized API keys and official access tokens through encrypted, redacted file imports. Sensitive browser material is never accepted.",
    },
    {
      icon: "model_training",
      title: "50+ AI Models",
      description: "Catalog-driven provider and model discovery with tenant allowlists, health status, authenticity evidence, and explicit availability notes.",
    },
    {
      icon: "shield",
      title: "Multiple Auth Methods",
      description: "Official OAuth, device-code, workload-identity, and API-key options are shown only where the provider documents them.",
    },
    {
      icon: "stream",
      title: "Streaming SSE",
      description: "Full streaming support via Server-Sent Events. Real-time responses with no buffering. Works with all major AI coding tools.",
    },
    {
      icon: "devices",
      title: "Works Everywhere",
      description: "Local gateway runs on your machine. Connect compatible tools at http://localhost:2018/v1, or deploy through an authorized server endpoint.",
    },
    {
      icon: "sync",
      title: "Accumulative Imports",
      description: "Review, test, enable, disable, and export safe account metadata without exposing imported secret values.",
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
