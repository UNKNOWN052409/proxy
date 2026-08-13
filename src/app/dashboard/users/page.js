"use client";

import { useEffect, useState } from "react";

const emptyForm = { email: "", password: "", modelIds: "", providerIds: "", rpmLimit: "", tokenLimit: "", activeFrom: "", activeUntil: "", profileSlug: "" };

function formatDate(value) {
  if (!value) return "No schedule";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/users", { cache: "no-store" });
      const data = await response.json();
      if (data.success) setUsers(data.users || []);
      else setMessage(data.error || "Admin access required");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function payload() {
    return {
      email: form.email,
      password: form.password,
      providerIds: form.providerIds.split(",").map((value) => value.trim()).filter(Boolean),
      modelIds: form.modelIds.split(",").map((value) => value.trim()).filter(Boolean),
      rpmLimit: Number(form.rpmLimit || 0),
      tokenLimit: Number(form.tokenLimit || 0),
      activeFrom: form.activeFrom ? new Date(form.activeFrom).toISOString() : null,
      activeUntil: form.activeUntil ? new Date(form.activeUntil).toISOString() : null,
      profileSlug: form.profileSlug.trim() || undefined,
    };
  }

  async function create(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/platform/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
    const data = await response.json();
    setMessage(data.success ? "User profile created" : data.error || "Could not create user");
    if (data.success) { setForm(emptyForm); load(); }
  }

  async function toggle(user) {
    const response = await fetch("/api/platform/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id, active: !user.active, ...user.scope && { providerIds: user.scope.provider_ids, modelIds: user.scope.model_ids, rpmLimit: user.scope.rpm_limit, tokenLimit: user.scope.token_limit, activeFrom: user.scope.active_from, activeUntil: user.scope.active_until, profileSlug: user.scope.profile_slug } }) });
    const data = await response.json();
    setMessage(data.success ? `${user.email} ${user.active ? "disabled" : "enabled"}` : data.error || "Update failed");
    load();
  }

  return <main className="dashboard-page" style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
    <h1>Users and access profiles</h1>
    <p>Admin-only control plane. User profiles never expose the administrator API key or unrestricted provider pool.</p>
    <form onSubmit={create} style={{ display: "grid", gap: 10, maxWidth: 760, marginTop: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        <input required placeholder="User email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input required placeholder="Temporary password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <input placeholder="Profile slug, e.g. client-acme" value={form.profileSlug} onChange={(event) => setForm({ ...form, profileSlug: event.target.value })} />
        <input placeholder="Allowed provider IDs (comma separated)" value={form.providerIds} onChange={(event) => setForm({ ...form, providerIds: event.target.value })} />
        <input placeholder="Allowed model IDs (comma separated)" value={form.modelIds} onChange={(event) => setForm({ ...form, modelIds: event.target.value })} />
        <input placeholder="RPM limit; 0 = unlimited" type="number" min="0" value={form.rpmLimit} onChange={(event) => setForm({ ...form, rpmLimit: event.target.value })} />
        <input placeholder="Token limit/window; 0 = unlimited" type="number" min="0" value={form.tokenLimit} onChange={(event) => setForm({ ...form, tokenLimit: event.target.value })} />
        <label>Active from<input type="datetime-local" value={form.activeFrom} onChange={(event) => setForm({ ...form, activeFrom: event.target.value })} /></label>
        <label>Active until<input type="datetime-local" value={form.activeUntil} onChange={(event) => setForm({ ...form, activeUntil: event.target.value })} /></label>
      </div>
      <button type="submit">Create scheduled user profile</button>
    </form>
    <p style={{ minHeight: 24 }}>{message}</p>
    <section style={{ marginTop: 24 }}>{loading ? <p>Loading profiles…</p> : users.map((user) => <article key={user.id} style={{ padding: 16, border: "1px solid #ddd", marginBottom: 10, borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{user.email}</strong><span>{user.role} · {user.active ? "Active" : "Disabled"}</span><button type="button" onClick={() => toggle(user)}>{user.active ? "Disable" : "Enable"}</button></div>
      <div style={{ marginTop: 8 }}>Profile URL suffix: <code>/{user.scope?.profile_slug || `user-${user.id}`}</code></div>
      <div>Providers: {user.scope?.provider_ids?.join(", ") || "all configured providers"}</div>
      <div>Models: {user.scope?.model_ids?.join(", ") || "all allowed models"}</div>
      <div>Limits: {user.scope?.rpm_limit || "unlimited"} RPM · {user.scope?.token_limit || "unlimited"} tokens</div>
      <div>Schedule: {formatDate(user.scope?.active_from)} → {formatDate(user.scope?.active_until)}</div>
    </article>)}</section>
  </main>;
}

