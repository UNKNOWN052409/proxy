"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Badge, Button, Modal } from "@/components/shared";

export default function ImportPage() {
  const [jsonText, setJsonText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("9Router");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Device code auth
  const [deviceModal, setDeviceModal] = useState(false);
  const [deviceStep, setDeviceStep] = useState("start"); // start -> auth -> polling -> done
  const [deviceData, setDeviceData] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState("");
  const pollRef = useRef(null);

  const handleImport = async () => {
    setError("");
    setResult(null);

    const trimmed = jsonText.trim();
    if (!trimmed) {
      setError("Please paste account JSON data");
      return;
    }

    let parsed;
    try { parsed = JSON.parse(trimmed); }
    catch (e) { setError(`Invalid JSON: ${e.message}`); return; }

    setImporting(true);
    try {
      const res = await fetch("/api/kiro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: parsed, source: sourceLabel.toLowerCase().replace(/\s+/g, "-"), format: "auto" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Import failed: ${res.status}`); return; }
      setResult(data);
      if (data.imported > 0) setJsonText("");
    } catch (e) { setError(e.message || "Import request failed"); }
    finally { setImporting(false); }
  };

  // Device Code Auth Flow
  const startDeviceAuth = async (authMethod = "builder-id") => {
    setDeviceModal(true);
    setDeviceStep("start");
    setDeviceData(null);
    setDeviceStatus("");

    try {
      const res = await fetch("/api/oauth/kiro/device/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authMethod, region: "us-east-1" }),
      });
      const data = await res.json();
      if (!res.ok) { throw new Error(data.error); }

      setDeviceData(data);
      setDeviceStep("auth");

      // Open verification URL
      window.open(data.verificationUriComplete, "_blank");

      // Start polling
      startPolling(data);
    } catch (e) {
      setError(e.message);
      setDeviceStep("start");
    }
  };

  const startPolling = (data) => {
    setDeviceStep("polling");
    const interval = (data.interval || 5) * 1000;
    let attempts = 0;
    const maxAttempts = Math.floor((data.expiresIn || 300) / (data.interval || 5));

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setDeviceStatus("Timed out. Please try again.");
        setDeviceStep("start");
        return;
      }
      attempts++;

      try {
        const params = new URLSearchParams({
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          deviceCode: data.deviceCode,
          region: data.region || "us-east-1",
          authMethod: data.authMethod || "builder-id",
        });
        const res = await fetch(`/api/oauth/kiro/device/poll?${params}`);
        const result = await res.json();

        if (result.success) {
          setDeviceStep("done");
          setDeviceStatus(`Account added: ${result.account.email || result.account.label}`);
          // Refresh accounts list
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          return;
        }

        if (result.pending) {
          setDeviceStatus("Waiting for you to authenticate in the browser...");
          pollRef.current = setTimeout(poll, interval);
        } else {
          setDeviceStatus(result.errorDescription || result.error || "Authentication failed");
          setDeviceStep("start");
        }
      } catch (e) {
        setDeviceStatus(`Poll error: ${e.message}`);
        pollRef.current = setTimeout(poll, interval);
      }
    };

    pollRef.current = setTimeout(poll, interval);
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  const exampleJson = JSON.stringify([
    { accessToken: "eyJhbGciOiJSUzI1NiIs...", refreshToken: "rt_abc123...", email: "user@example.com" }
  ], null, 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Import Accounts</h1>
        <p className="text-text-muted text-sm mt-1">Import Kiro accounts from other proxies or authenticate directly</p>
      </div>

      {/* Device Code Auth Card */}
      <Card title="Add Kiro via Browser" icon="devices" subtitle="Authenticate directly with Kiro/AWS">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Sign in with your Kiro account through the browser. No need to copy-paste tokens.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" icon="devices" onClick={() => startDeviceAuth("builder-id")}>
              AWS Builder ID
            </Button>
            <Button variant="outline" size="md" icon="badge" onClick={() => startDeviceAuth("idc")}>
              IAM Identity Center
            </Button>
            <Button variant="ghost" size="sm" icon="help" disabled>
              Need a Kiro account?
            </Button>
          </div>
        </div>
      </Card>

      {/* Device Code Modal */}
      <Modal isOpen={deviceModal} onClose={() => { setDeviceModal(false); if(pollRef.current) clearTimeout(pollRef.current); }} title="Kiro Authentication" size="md">
        <div className="space-y-6 text-center">
          {deviceStep === "start" && (
            <div className="py-4">
              <p className="text-text-muted text-sm">Starting authentication...</p>
            </div>
          )}

          {deviceStep === "auth" && deviceData && (
            <div>
              <div className="size-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[36px] text-brand-400">devices</span>
              </div>
              <h3 className="text-lg font-semibold text-text-main mb-2">Authenticate in Browser</h3>
              <p className="text-text-muted text-sm mb-4">
                A new tab should open. If not, enter the code below:
              </p>
              <div className="inline-block px-6 py-3 rounded-xl bg-bg border border-border mb-4">
                <span className="text-2xl font-mono font-bold text-text-main tracking-widest">{deviceData.userCode}</span>
              </div>
              <div className="text-xs text-text-subtle overflow-hidden text-ellipsis">
                URL: {deviceData.verificationUri}
              </div>
            </div>
          )}

          {deviceStep === "polling" && (
            <div className="py-4">
              <div className="size-12 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span className="material-symbols-outlined text-[28px] text-brand-400">sync</span>
              </div>
              <p className="text-text-muted text-sm">{deviceStatus}</p>
            </div>
          )}

          {deviceStep === "done" && (
            <div className="py-4">
              <div className="size-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[36px] text-emerald-400">check_circle</span>
              </div>
              <h3 className="text-lg font-semibold text-text-main mb-2">Authentication Successful!</h3>
              <p className="text-text-muted text-sm mb-4">{deviceStatus}</p>
              <Button variant="primary" onClick={() => setDeviceModal(false)}>Done</Button>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 text-xs text-text-subtle">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            Your credentials stay local on your machine
          </div>
        </div>
      </Modal>

      {/* Rest of import page ... */}
      <div className="flex flex-wrap gap-2">
        {["9Router", "Kiro IDE", "CLI Proxy", "Manual"].map((src) => (
          <button
            key={src}
            onClick={() => setSourceLabel(src)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              sourceLabel === src
                ? "bg-brand-500/10 text-brand-400 border-brand-500/20"
                : "bg-surface text-text-muted border-border hover:border-brand-500/20 hover:text-text-main"
            }`}
          >
            {src}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-main">Paste Account JSON</label>
            <button onClick={() => setJsonText(exampleJson)} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">Show example</button>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={exampleJson}
            className="w-full rounded-xl border border-border bg-bg p-4 text-sm font-mono text-text-main resize-y min-h-[200px] focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/30 transition-all placeholder:text-text-subtle"
            disabled={importing}
          />
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>{error}
            </div>
          )}
          {result && (
            <div className="space-y-3 p-4 rounded-xl bg-bg border border-border">
              <div className="flex items-center gap-2">
                <Badge variant={result.failed > 0 ? "warning" : "success"} size="md" dot>{result.imported} imported</Badge>
                {result.failed > 0 && <Badge variant="error" size="md" dot>{result.failed} failed</Badge>}
                <Badge variant="neutral" size="md">{result.total} total</Badge>
              </div>
              {result.imported > 0 && <p className="text-xs text-text-muted">Accounts saved persistently. Available after restart.</p>}
              {result?.results?.filter(r => !r.ok)?.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {result.results.filter(r => !r.ok).map((item, i) => (
                    <p key={i} className="text-xs text-red-400 font-mono">[{item.index}] {item.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button variant="primary" fullWidth onClick={handleImport} disabled={importing || !jsonText.trim()} loading={importing} icon="file_download">
            {importing ? "Importing..." : `Import from ${sourceLabel}`}
          </Button>
        </div>
      </Card>

      <Card title="Supported Formats" icon="description" subtitle="Paste any of these formats">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">9Router / Generic</p>
            <pre className="p-3 rounded-lg bg-bg border border-border text-[11px] font-mono text-text-muted overflow-x-auto">{`{ "accessToken": "eyJ...", "refreshToken": "rt_...", "email": "user@example.com" }`}</pre>
          </div>
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">Bulk Array</p>
            <pre className="p-3 rounded-lg bg-bg border border-border text-[11px] font-mono text-text-muted overflow-x-auto">{`[{ "accessToken": "eyJ...", "email": "a@b.com" }, { ... }]`}</pre>
          </div>
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">With Provider Data</p>
            <pre className="p-3 rounded-lg bg-bg border border-border text-[11px] font-mono text-text-muted overflow-x-auto">{`{ "accessToken": "eyJ...", "providerSpecificData": { "authMethod": "builder-id" } }`}</pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
