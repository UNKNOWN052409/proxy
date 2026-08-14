"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Modal, Skeleton } from "@/components/shared";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeModal, setRemoveModal] = useState(null);
  const [exportFormat, setExportFormat] = useState("default");
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});

  useEffect(() => { fetchAccounts(); }, []);

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

  const removeAccount = async (id) => {
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      setRemoveModal(null);
      fetchAccounts();
    } catch (e) {
      console.error("Failed to remove account:", e);
    }
  };

  const handleExport = () => {
    const formatParam = exportFormat === "default" ? "" : `?format=${exportFormat}`;
    window.open(`/api/accounts/export${formatParam}`, "_blank");
  };

  const testAccount = async (id) => {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: null }));

    try {
      const res = await fetch("/api/accounts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, error: e.message || "Test failed" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Accounts</h1>
          <p className="text-text-muted text-sm mt-1">Manage encrypted official OAuth tokens and API credentials for configured providers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export */}
          <div className="flex items-center gap-1">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="h-9 rounded-lg bg-surface border border-border text-text-muted text-xs px-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="default">Encrypted Provider Account Format</option>
              <option value="9router">9Router Format</option>
              <option value="kiro-ide">Kiro IDE Format</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              icon="download"
              onClick={handleExport}
              disabled={accounts.length === 0}
            >
              Export
            </Button>
          </div>
          <a href="/dashboard/import">
            <Button variant="primary" size="md" icon="file_download">
              Import
            </Button>
          </a>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="size-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[36px] text-brand-400">key_off</span>
            </div>
            <h3 className="text-lg font-semibold text-text-main mb-2">No Accounts</h3>
            <p className="text-text-muted text-sm mb-6 max-w-md mx-auto">
              Import explicit official OAuth tokens or API credentials for configured providers.
              Multiple encrypted imports accumulate — browser sessions, cookies, and passwords are not accepted.
            </p>
            <a href="/dashboard/import">
              <Button variant="primary" icon="file_download">Import Your First Account</Button>
            </a>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border-subtle">
            {accounts.map((acct) => (
              <Card.ListItem
                key={acct.id}
                actions={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="verified"
                      onClick={() => testAccount(acct.id)}
                      loading={testingId === acct.id}
                      disabled={testingId === acct.id}
                    >
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="delete"
                      onClick={() => setRemoveModal(acct)}
                      className="text-danger hover:text-danger"
                    >
                      Remove
                    </Button>
                  </div>
                }
              >
                <div className="flex items-center gap-3">
                  <div className={`size-10 rounded-xl flex items-center justify-center ${
                    acct.provider === "kiro" ? "bg-brand-500/10" : "bg-emerald-500/10"
                  }`}>
                    <span className={`material-symbols-outlined text-[22px] ${
                      acct.provider === "kiro" ? "text-brand-400" : "text-emerald-400"
                    }`}>account_circle</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-main">
                        {acct.label || acct.email || `Account ${acct.id?.slice(0, 8)}`}
                      </p>
                      <Badge variant={acct.active ? "success" : "error"} size="sm" dot>
                        {acct.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="neutral" size="sm">
                        {acct.provider || "kiro"}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {acct.authType || "oauth"} · via {acct.source || "manual"}
                      {acct.email && ` · ${acct.email}`}
                    </p>
                    {acct.expiresAt && (
                      <p className="text-[10px] text-text-subtle mt-0.5">
                        Expires: {new Date(acct.expiresAt).toLocaleString()}
                      </p>
                    )}
                    {testResults[acct.id] && (
                      <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${
                        testResults[acct.id].valid
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {testResults[acct.id].valid ? "check_circle" : "error"}
                        </span>
                        <span className="flex-1">
                          {testResults[acct.id].message}
                          {testResults[acct.id].latency && (
                            <span className="text-text-subtle ml-1">
                              ({testResults[acct.id].latency}ms)
                            </span>
                          )}
                          {testResults[acct.id].details?.model && (
                            <span className="text-text-subtle ml-1">· {testResults[acct.id].details.model}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {testResults[acct.id]?.details?.routing && (
                      <p className={`text-[10px] mt-1 ${testResults[acct.id].details.routing.routingEligible ? "text-emerald-400" : "text-amber-400"}`}>
                        Routing: {testResults[acct.id].details.routing.routingEligible ? "eligible" : "blocked"}
                        {testResults[acct.id].details.routing.routingReason ? ` · ${testResults[acct.id].details.routing.routingReason}` : ""}
                      </p>
                    )}
                    {acct.lastVerification?.checkedAt && !testResults[acct.id] && (
                      <p className="text-[10px] text-text-subtle mt-1">
                        Last test: {acct.lastVerification.status || "unknown"} · {new Date(acct.lastVerification.checkedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </Card.ListItem>
            ))}
          </div>
        </Card>
      )}

      <Modal isOpen={!!removeModal} onClose={() => setRemoveModal(null)} title="Remove Account">
        <p className="text-text-muted text-sm mb-6">
          Are you sure you want to remove this account? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="danger" fullWidth onClick={() => removeAccount(removeModal.id)}>
            Remove
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setRemoveModal(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
