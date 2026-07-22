"use client";

import Link from "next/link";

export default function GetStartedSection() {
  return (
    <section className="relative py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative p-10 sm:p-14 rounded-3xl bg-gradient-to-br from-brand-500/10 via-accent-500/5 to-transparent border border-brand-500/20 overflow-hidden text-center">
          {/* Decorative */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-500/8 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2" />

          <div className="relative">
            <div className="size-14 rounded-2xl bg-brand-500/20 flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[32px] text-brand-400">rocket_launch</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Start?
            </h2>
            <p className="text-gray-400 max-w-lg mx-auto mb-8">
              Import your Kiro accounts and start using Claude Opus, GPT-5.6, and 50+ models for free. No credit card needed.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="h-12 px-8 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-base shadow-xl shadow-brand-500/30 hover:shadow-brand-500/50 transition-all inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">dashboard</span>
                Open Dashboard
              </Link>
              <a
                href="https://kiro.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="h-12 px-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 font-medium text-base border border-white/10 transition-all inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                Learn About Kiro
              </a>
            </div>

            <p className="text-xs text-gray-600 mt-6">
              Your accounts stay local. No data leaves your machine except to the Kiro API.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
