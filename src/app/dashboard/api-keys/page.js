"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Modal } from "@/components/shared";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRevoked, setShowRevoked] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", expiresInDays: 365, profileSlug: "", providerIds: "", modelIds: "", rpmLimit: 0, tokenLimit: 0 });
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(null);

  // Load keys
  const loadKeys = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ includeRevoked: showRevoked.toString() });
      const response = await fetch(`/api/keys?${params}`);
      const data = await response.json();

      if (data.success) {
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.error("Failed to load keys:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [showRevoked]);

  // Create key
  const handleCreate = async (e) => {
    e.preventDefault();

    if (!createForm.name.trim()) {
      alert("Please enter a key name");
      return;
    }

    try {
      setCreating(true);
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...createForm, profileSlug: createForm.profileSlug || null, providerIds: createForm.providerIds.split(",").map((value) => value.trim()).filter(Boolean), modelIds: createForm.modelIds.split(",").map((value) => value.trim()).filter(Boolean), rpmLimit: Number(createForm.rpmLimit) || 0, tokenLimit: Number(createForm.tokenLimit) || 0 }),
      });

      const data = await response.json();

      if (data.success) {
        setNewKey(data.key);
        setCreateForm({ name: "", expiresInDays: 365, profileSlug: "", providerIds: "", modelIds: "", rpmLimit: 0, tokenLimit: 0 });
        await loadKeys();
      } else {
        alert(data.error || "Failed to create key");
      }
    } catch (error) {
      console.error("Create error:", error);
      alert("Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  // Revoke key
  const handleRevoke = async (keyId, keyName) => {
    if (!confirm(`Revoke API key "${keyName}"?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      const data = await response.json();

      if (data.success) {
        await loadKeys();
      } else {
        alert(data.error || "Failed to revoke key");
      }
    } catch (error) {
      console.error("Revoke error:", error);
      alert("Failed to revoke key");
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Format date
  const formatDate = (isoString) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Check if expired
  const isExpired = (expiresAt) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">API Keys</h1>
          <p className="text-text-muted text-sm mt-1">
            Manage API keys for programmatic access to your proxy
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} icon="add">
          Create Key
        </Button>
      </div>

      {/* New Key Display */}
      {newKey && (
        <Card padding="sm" variant="success">
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] text-green-400 shrink-0">
                check_circle
              </span>
              <div className="flex-1">
                <p className="font-medium text-green-400 mb-1">API Key Created</p>
                <p className="text-xs text-text-muted mb-3">
                  Save this key now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm font-mono text-text-main break-all">
                    {newKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="content_copy"
                    onClick={() => copyToClipboard(newKey, "new-key")}
                  >
                    {copied === "new-key" ? "✓" : ""}
                  </Button>
                </div>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="text-text-muted hover:text-text-main"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Keys List */}
      <Card
        title="API Keys"
        icon="key"
        subtitle={`${keys.length} key${keys.length !== 1 ? "s" : ""}`}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRevoked(!showRevoked)}
          >
            {showRevoked ? "Hide" : "Show"} Revoked
          </Button>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-text-muted">Loading keys...</div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center">
            <span className="material-symbols-outlined text-[48px] text-text-muted mb-2 block">
              key_off
            </span>
            <p className="text-text-muted">
              {showRevoked ? "No revoked keys" : "No API keys yet"}
            </p>
            {!showRevoked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="mt-4"
              >
                Create your first key
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => {
              const expired = isExpired(key.expires_at);
              const revoked = !!key.revoked_at;

              return (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-bg hover:bg-surface-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-text-main truncate">
                        {key.name}
                      </p>
                      {revoked && <Badge variant="neutral" size="sm">Revoked</Badge>}
                      {expired && !revoked && <Badge variant="error" size="sm">Expired</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span>Created {formatDate(key.created_at)}</span>
                      <span>•</span>
                      <span>Expires {formatDate(key.expires_at)}</span>
                      {key.last_used_at && (
                        <>
                          <span>•</span>
                          <span>Last used {formatDate(key.last_used_at)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>RPM {key.rpm_limit || "unlimited"}</span>
                      <span>•</span>
                      <span>Tokens {key.token_limit || "unlimited"}</span>
                    </div>
                  </div>
                  {!revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="delete"
                      onClick={() => handleRevoke(key.id, key.name)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => !creating && setShowCreateModal(false)}
          title="Create API Key"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-2">
                Key Name
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                placeholder="e.g., Production Server"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                disabled={creating}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-2">Profile Slug (optional)</label>
              <input type="text" value={createForm.profileSlug} onChange={(e) => setCreateForm({ ...createForm, profileSlug: e.target.value })} placeholder="e.g., client-acme" pattern="[a-z0-9-]+" className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main" disabled={creating} />
              <p className="text-xs text-text-muted mt-1">Used for tenant-scoped routing and reporting.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-2">Provider IDs (comma-separated)</label>
              <input type="text" value={createForm.providerIds} onChange={(e) => setCreateForm({ ...createForm, providerIds: e.target.value })} placeholder="openai, gemini" className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main" disabled={creating} />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-2">Model IDs (comma-separated)</label>
              <input type="text" value={createForm.modelIds} onChange={(e) => setCreateForm({ ...createForm, modelIds: e.target.value })} placeholder="gpt-4o-mini, gemini-3.1-flash-image" className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main" disabled={creating} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-main mb-2">RPM limit</label>
                <input type="number" min="0" max="100000" value={createForm.rpmLimit} onChange={(e) => setCreateForm({ ...createForm, rpmLimit: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main" disabled={creating} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-2">Token limit / day</label>
                <input type="number" min="0" max="100000000" value={createForm.tokenLimit} onChange={(e) => setCreateForm({ ...createForm, tokenLimit: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main" disabled={creating} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-2">
                Expires In (Days)
              </label>
              <input
                type="number"
                value={createForm.expiresInDays}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    expiresInDays: parseInt(e.target.value, 10),
                  })
                }
                min="1"
                max="3650"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-main focus:outline-none focus:ring-2 focus:ring-brand-400"
                disabled={creating}
                required
              />
              <p className="text-xs text-text-muted mt-1">
                Key will expire on{" "}
                {new Date(
                  Date.now() + createForm.expiresInDays * 24 * 60 * 60 * 1000
                ).toLocaleDateString()}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Key"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
