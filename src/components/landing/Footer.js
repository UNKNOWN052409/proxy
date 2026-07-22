"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[#2e2e42]/50 py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-[16px] text-white">bolt</span>
              </div>
              <span className="text-white font-bold text-sm">Kiro Proxy</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Free, open-source Kiro AI proxy with a beautiful dashboard.
              Not affiliated with Kiro AI or AWS.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Quick Links</h4>
            <div className="flex flex-col gap-2">
              <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Dashboard</Link>
              <a href="#features" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">How it Works</a>
              <a href="#models" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Models</a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Resources</h4>
            <div className="flex flex-col gap-2">
              <a href="https://kiro.dev" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Kiro AI</a>
              <a href="https://github.com/decolua/9router" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">9Router</a>
              <a href="https://aws.amazon.com/codewhisperer/" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">AWS CodeWhisperer</a>
            </div>
          </div>
        </div>

        <div className="border-t border-[#2e2e42]/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">© {new Date().getFullYear()} Kiro Proxy. Not affiliated with Kiro AI.</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-600">Built with Next.js + Tailwind</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
