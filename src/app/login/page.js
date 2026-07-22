"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/shared";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Quick client-side check first - avoid blocking UI
    const authCookie = document.cookie.includes("kp-auth=authenticated");
    if (authCookie) {
      router.replace("/dashboard");
      return;
    }

    // Background server check (non-blocking)
    fetch("/api/config/auth/check")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated || !data.hasPassword) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // If API fails, show login form anyway
      });
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setChecking(true);

    try {
      const res = await fetch("/api/config/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        router.replace("/dashboard");
      } else {
        setError(data.error || "Wrong password");
      }
    } catch {
      setError("Login failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-brand-500/20">
            <span className="material-symbols-outlined text-[36px] text-white">bolt</span>
          </div>
          <h1 className="text-2xl font-bold text-text-main">Kiro Proxy</h1>
          <p className="text-sm text-text-muted mt-1">Enter your dashboard password</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Card>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-main block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter dashboard password"
                  autoFocus
                  className="w-full h-11 rounded-xl border border-border bg-bg px-4 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/30 transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {error}
                </div>
              )}

              <Button variant="primary" fullWidth type="submit" disabled={!password || checking} loading={checking}>
                {checking ? "Checking..." : "Unlock Dashboard"}
              </Button>
            </div>
          </Card>

          <p className="text-center text-xs text-text-subtle">
            This is a local proxy. Your data stays on your machine.
          </p>
        </form>
      </div>
    </div>
  );
}
