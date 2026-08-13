"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Toggle } from "@/components/shared";

export default function SettingsPage() {
  const [tunnel, setTunnel] = useState({ enabled: false, url: null });
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [passwordMode, setPasswordMode] = useState("set"); // set | change | clear
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [tunnelMessage, setTunnelMessage] = useState("");
  const [tunnelMode, setTunnelMode] = useState("quick");
  const [tunnelName, setTunnelName] = useState("");
  const [tunnelHostname, setTunnelHostname] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [connectProfile, setConnectProfile] = useState("custom");
  const [connectBaseUrl, setConnectBaseUrl] = useState("");
  const [connectModel, setConnectModel] = useState("");
  const [connectOutput, setConnectOutput] = useState(null);

  useEffect(() => {
    fetch("/api/config/tunnel")
      .then(r => r.json())
      .then(setTunnel)
      .catch(() => {});

    fetch("/api/config/auth/check")
      .then(r => r.json())
      .then(data => setHasPassword(data.hasPassword))
      .catch(() => {});
    fetch("/api/config/connect")
      .then(r => r.json())
      .then(data => { setProfiles(data.profiles || []); setConnectBaseUrl(data.gateway?.baseUrl || ""); })
      .catch(() => {});
  }, []);

  const handleStartTunnel = async () => {
    setTunnelLoading(true);
    setTunnelMessage("");
    try {
      const res = await fetch("/api/config/tunnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", provider: "cloudflare", mode: tunnelMode, name: tunnelName || null, hostname: tunnelHostname || null }),
      });
      const data = await res.json();
      if (data.success) {
        setTunnel({ enabled: true, url: data.url });
        setTunnelMessage(`Tunnel active at ${data.url}`);
      } else {
        setTunnelMessage(data.error || "Failed to start tunnel");
      }
    } catch (e) {
      setTunnelMessage(`Error: ${e.message}`);
    } finally {
      setTunnelLoading(false);
    }
  };

  const handleGenerateConnection = async () => {
    try {
      const res = await fetch("/api/config/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: connectProfile, baseUrl: connectBaseUrl, model: connectModel || null }) });
      const data = await res.json();
      setConnectOutput(data.success ? data.connection : { error: data.error });
    } catch (error) { setConnectOutput({ error: error.message }); }
  };

  const handleStopTunnel = async () => {
    setTunnelLoading(true);
    try {
      await fetch("/api/config/tunnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      setTunnel({ enabled: false, url: null });
      setTunnelMessage("Tunnel stopped");
    } catch (e) {
      setTunnelMessage(`Error: ${e.message}`);
    } finally {
      setTunnelLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");

    if (!password) {
      setPassError("Password is required");
      return;
    }
    if ((passwordMode === "change" || passwordMode === "set") && password !== passwordConfirm) {
      setPassError("Passwords do not match");
      return;
    }
    if (password.length < 4) {
      setPassError("Password must be at least 4 characters");
      return;
    }

    try {
      const res = await fetch("/api/config/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setPassSuccess("Password updated!");
        setPassword("");
        setPasswordConfirm("");
        setHasPassword(true);
        setPasswordMode("change");
      } else {
        setPassError(data.error || "Failed to set password");
      }
    } catch (e) {
      setPassError(`Error: ${e.message}`);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/config/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Settings</h1>
        <p className="text-text-muted text-sm mt-1">Configure your proxy and security</p>
      </div>

      {/* Tunnel / Public Access */}
      <Card title="Public Access (Tunnel)" icon="public" subtitle="Temporary Cloudflare Quick Tunnel or a persistent user-owned named tunnel">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-text-muted">Tunnel mode<select value={tunnelMode} onChange={(e) => setTunnelMode(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main"><option value="quick">Quick Tunnel (temporary)</option><option value="named">Named Tunnel (persistent)</option></select></label>
            <label className="text-xs text-text-muted">Cloudflare tunnel name<input value={tunnelName} onChange={(e) => setTunnelName(e.target.value)} placeholder="required for named mode" className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main" /></label>
            <label className="text-xs text-text-muted">Public hostname<input value={tunnelHostname} onChange={(e) => setTunnelHostname(e.target.value)} placeholder="https://api.example.com" className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main" /></label>
          </div>
          <p className="text-xs text-text-muted">Quick Tunnel URLs are temporary. A named tunnel remains available only while the Cloudflare tunnel service and your domain configuration are running; the gateway cannot make a Quick Tunnel permanent.</p>
          <p className="text-sm text-text-muted">
            Expose your local proxy to the internet. Anyone with the URL can use your endpoint.
            Keep your dashboard password strong when public access is enabled.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-bg border border-border">
            <div className="flex items-center gap-3">
              <span className={`size-3 rounded-full ${tunnel.enabled ? "bg-emerald-500 animate-pulse" : "bg-text-subtle"}`} />
              <div>
                <p className="text-sm font-medium text-text-main">
                  {tunnel.enabled ? "Public (Tunnel Active)" : "Local Only"}
                </p>
                {tunnel.url && (
                  <code className="text-xs text-text-muted font-mono mt-0.5 block">{tunnel.url}</code>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tunnel.url && (
                <Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} onClick={() => {
                  navigator.clipboard.writeText(tunnel.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              )}
              <Button
                variant={tunnel.enabled ? "danger" : "primary"}
                size="sm"
                icon={tunnel.enabled ? "power_off" : "power"}
                onClick={tunnel.enabled ? handleStopTunnel : handleStartTunnel}
                disabled={tunnelLoading}
                loading={tunnelLoading}
              >
                {tunnel.enabled ? "Stop" : "Start"}
              </Button>
            </div>
          </div>

          {tunnelMessage && (
            <div className={`p-3 rounded-lg text-sm ${tunnelMessage.includes("active") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
              {tunnelMessage}
            </div>
          )}

          {tunnel.monitoring && (
            <div className="grid sm:grid-cols-4 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="text-text-muted">Status</span><p className="text-text-main font-medium mt-1">{tunnel.monitoring.status || "unknown"}</p></div>
              <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="text-text-muted">Local health</span><p className="text-text-main font-medium mt-1">{tunnel.monitoring.localHealthy == null ? "—" : tunnel.monitoring.localHealthy ? "Healthy" : "Down"}</p></div>
              <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="text-text-muted">Public health</span><p className="text-text-main font-medium mt-1">{tunnel.monitoring.publicHealthy == null ? "—" : tunnel.monitoring.publicHealthy ? "Healthy" : "Down"}</p></div>
              <div className="p-3 rounded-lg bg-surface-2/50 border border-border"><span className="text-text-muted">Last check</span><p className="text-text-main font-medium mt-1">{tunnel.monitoring.lastCheckAt ? new Date(tunnel.monitoring.lastCheckAt).toLocaleTimeString() : "—"}</p></div>
            </div>
          )}

          {tunnel.url && (
            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/10">
              <p className="text-xs font-medium text-text-muted mb-1">Use this URL in your AI tools:</p>
              <code className="text-sm text-brand-400 font-mono block break-all">{tunnel.url}/v1</code>
            </div>
          )}
        </div>
      </Card>

      <Card title="CLI and Local Proxy Connect" icon="terminal" subtitle="Generate safe OpenAI-compatible connection settings for authorized tools">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Choose a documented or local profile, then point your CLI or local app at this gateway. Provider credentials stay server-side; this panel never imports cookies, browser sessions, or passwords.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-text-muted">Profile<select value={connectProfile} onChange={(e) => setConnectProfile(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
            <label className="text-xs text-text-muted">Gateway/base URL<input value={connectBaseUrl} onChange={(e) => setConnectBaseUrl(e.target.value)} placeholder="http://127.0.0.1:20127/v1" className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main" /></label>
            <label className="text-xs text-text-muted">Model (optional)<input value={connectModel} onChange={(e) => setConnectModel(e.target.value)} placeholder="provider/model-id" className="mt-1 w-full h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text-main" /></label>
          </div>
          <Button variant="primary" size="sm" icon="content_copy" onClick={handleGenerateConnection}>Generate connection config</Button>
          {connectOutput && <pre className="p-4 rounded-xl bg-bg border border-border text-xs text-text-muted overflow-auto whitespace-pre-wrap">{JSON.stringify(connectOutput, null, 2)}</pre>}
        </div>
      </Card>

      {/* Dashboard Password */}
      <Card title="Dashboard Security" icon="lock" subtitle={hasPassword ? "Password is enabled" : "No password set — anyone can access your dashboard"}>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-main block mb-1.5">
              {passwordMode === "clear" ? "Current Password" : passwordMode === "change" ? "New Password" : "Set Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasPassword ? "Enter new password" : "Choose a dashboard password"}
              className="w-full h-11 rounded-xl border border-border bg-bg px-4 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/30 transition-all"
            />
          </div>

          {(passwordMode === "set" || passwordMode === "change") && (
            <div>
              <label className="text-sm font-medium text-text-main block mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full h-11 rounded-xl border border-border bg-bg px-4 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/30 transition-all"
              />
            </div>
          )}

          {passError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>{passError}
            </div>
          )}

          {passSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>{passSuccess}
            </div>
          )}

          <div className="flex items-center gap-2">
            {hasPassword ? (
              <>
                <Button variant="primary" size="sm" type="submit" icon="lock" disabled={!password}>
                  Change Password
                </Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => { setPasswordMode("change"); setPassword(""); setPasswordConfirm(""); setPassError(""); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" type="submit" icon="lock" disabled={!password || !passwordConfirm}>
                Set Password
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Danger Zone */}
      <Card title="Session" icon="logout" subtitle="Manage your session">
        <div className="space-y-3">
          <Button variant="outline" size="md" icon="logout" onClick={handleLogout}>
            Lock Dashboard (Logout)
          </Button>
          <p className="text-xs text-text-subtle">
            Logging out will require the dashboard password again to access this page.
          </p>
        </div>
      </Card>

      {/* Quick links */}
      <Card title="Quick Links" icon="link" subtitle="Common actions">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/dashboard/endpoint" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">api</span>
            <p className="text-xs text-text-main font-medium">Endpoint</p>
          </a>
          <a href="/dashboard/import" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">file_download</span>
            <p className="text-xs text-text-main font-medium">Import</p>
          </a>
          <a href="/dashboard/accounts" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">manage_accounts</span>
            <p className="text-xs text-text-main font-medium">Accounts</p>
          </a>
          <a href="/" className="p-4 rounded-xl bg-bg border border-border hover:border-brand-500/20 transition-all text-center">
            <span className="material-symbols-outlined text-[28px] text-brand-400 mb-1">home</span>
            <p className="text-xs text-text-main font-medium">Home</p>
          </a>
        </div>
      </Card>
    </div>
  );
}
