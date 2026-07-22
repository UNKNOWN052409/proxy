"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Toggle } from "@/components/shared";
import { cn } from "@/lib/cn";

/**
 * Export Page
 * Configure and download account exports in various formats
 */
export default function ExportPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState("kiro-proxy");
  const [includePasswords, setIncludePasswords] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (accounts.length === 0) return;

    setExporting(true);

    try {
      const params = new URLSearchParams({
        format,
        includePasswords: includePasswords.toString(),
      });

      const res = await fetch(`/api/accounts/export?${params}`);

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kiro-accounts-${format}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  const formatOptions = [
    {
      id: "kiro-proxy",
      name: "Kiro Proxy",
      description: "Native format with full metadata and version info",
      structure: '{ format, version, exportedAt, accounts: [...] }',
      recommended: true,
    },
    {
      id: "9router",
      name: "9Router",
      description: "Compatible with 9Router proxy format",
      structure: '{ accounts: [{ email, tier, password?, ...metadata }] }',
    },
    {
      id: "omnirouter",
      name: "OMNIROUTER",
      description: "Compatible with OMNIROUTER format",
      structure: '{ connections: [{ username, tier, password?, ...metadata }] }',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Export Accounts</h1>
          <p className="text-text-muted text-sm mt-1">
            Download your accounts in various formats
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="arrow_back"
          onClick={() => router.push("/dashboard/accounts")}
        >
          Back to Accounts
        </Button>
      </div>

      {/* Account Count */}
      {!loading && (
        <Card>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px] text-brand-400">
                  account_circle
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-text-main">
                  {accounts.length} Account{accounts.length !== 1 ? "s" : ""} Ready
                </p>
                <p className="text-xs text-text-muted">
                  {accounts.length === 0
                    ? "No accounts to export"
                    : "All active accounts will be included"}
                </p>
              </div>
            </div>
            {accounts.length > 0 && (
              <Badge variant="success" size="sm" dot>
                Ready
              </Badge>
            )}
          </div>
        </Card>
      )}

      {/* Format Selection */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text-main">Choose Export Format</h2>
        <div className="grid grid-cols-1 gap-3">
          {formatOptions.map((option) => (
            <Card
              key={option.id}
              className={cn(
                "cursor-pointer transition-all hover:border-brand-500/30",
                format === option.id && "border-brand-500 bg-brand-500/5"
              )}
              onClick={() => setFormat(option.id)}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Radio */}
                  <div className="mt-0.5">
                    <div
                      className={cn(
                        "size-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        format === option.id
                          ? "border-brand-500 bg-brand-500"
                          : "border-border"
                      )}
                    >
                      {format === option.id && (
                        <div className="size-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-text-main">{option.name}</p>
                      {option.recommended && (
                        <Badge variant="brand" size="sm">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mb-2">{option.description}</p>
                    <code className="text-[10px] text-text-subtle bg-surface-2 px-2 py-1 rounded border border-border-subtle block overflow-x-auto">
                      {option.structure}
                    </code>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Options */}
      <Card>
        <div className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-main">Export Options</h3>

          {/* Password Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-text-main">Include Password Hashes</p>
                <Badge variant="warning" size="sm">Sensitive</Badge>
              </div>
              <p className="text-xs text-text-muted">
                Include bcrypt password hashes in the export. Hashes cannot be reversed to plaintext.
              </p>
            </div>
            <Toggle
              enabled={includePasswords}
              onChange={setIncludePasswords}
            />
          </div>
        </div>
      </Card>

      {/* Security Notice */}
      {includePasswords && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <div className="p-4">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0">
                warning
              </span>
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-400">Security Notice</p>
                <p className="text-xs text-text-muted">
                  Password hashes will be included in the export. While these are bcrypt hashes and cannot be
                  reversed to plaintext, you should still protect this file and avoid sharing it.
                  Store it securely and delete it when no longer needed.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Export Button */}
      <div className="flex gap-3">
        <Button
          variant="primary"
          size="lg"
          icon="download"
          fullWidth
          onClick={handleExport}
          disabled={accounts.length === 0 || loading}
          loading={exporting}
        >
          Export {accounts.length} Account{accounts.length !== 1 ? "s" : ""}
        </Button>
      </div>

      {/* Additional Info */}
      <Card>
        <div className="p-4">
          <div className="flex gap-3">
            <span className="material-symbols-outlined text-blue-400 text-[20px] shrink-0">
              info
            </span>
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-main">What gets exported?</p>
              <ul className="text-xs text-text-muted space-y-1 list-disc pl-4">
                <li>All active accounts from your Kiro Proxy installation</li>
                <li>Account metadata (email, tier, provider, timestamps)</li>
                <li>Session keys and authentication tokens (if present)</li>
                <li>Password hashes (if "Include Password Hashes" is enabled)</li>
                <li>Format-specific structure and version information</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
