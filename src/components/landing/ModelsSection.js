"use client";

export default function ModelsSection() {
  const categories = [
    {
      name: "Claude Opus",
      models: ["Opus 4.8", "Opus 4.7", "Opus 4.5"],
      color: "from-purple-500/20 to-purple-600/10",
      icon: "psychology",
    },
    {
      name: "Claude Sonnet",
      models: ["Sonnet 5", "Sonnet 4.5"],
      color: "from-blue-500/20 to-blue-600/10",
      icon: "auto_awesome",
    },
    {
      name: "Claude Haiku",
      models: ["Haiku 4.5"],
      color: "from-emerald-500/20 to-emerald-600/10",
      icon: "bolt",
    },
    {
      name: "GPT-5.6",
      models: ["Sol (272k ctx)", "Terra (272k ctx)", "Luna (272k ctx)"],
      color: "from-amber-500/20 to-amber-600/10",
      icon: "neurology",
    },
    {
      name: "Open Source",
      models: ["DeepSeek 3.2", "Qwen3 Coder", "GLM 5", "MiniMax M2.5"],
      color: "from-rose-500/20 to-rose-600/10",
      icon: "code",
    },
  ];

  return (
    <section id="models" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            50+ Models Available
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            All models are free and unlimited. Each with thinking and agentic variants.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-gradient-to-br border border-white/[0.06] hover:border-brand-500/20 transition-all duration-300"
              style={{ backgroundImage: `linear-gradient(to bottom right, rgba(91,82,245,0.03), transparent)` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`size-10 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-[22px] text-brand-400">{cat.icon}</span>
                </div>
                <h3 className="text-white font-semibold">{cat.name}</h3>
              </div>
              <div className="space-y-2">
                {cat.models.map((model, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="size-1.5 rounded-full bg-brand-500/50" />
                    {model}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm text-gray-500">
            All models available with -thinking, -agentic, and -thinking-agentic variants.
          </p>
        </div>
      </div>
    </section>
  );
}
