"use client";
import { useEffect, useState } from "react";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", modelIds: "", providerIds: "" });
  const [message, setMessage] = useState("");
  async function load() { const r = await fetch("/api/platform/users"); const j = await r.json(); if (j.success) setUsers(j.users); else setMessage(j.error || "Admin access required"); }
  useEffect(() => { load(); }, []);
  async function create(e) {
    e.preventDefault(); setMessage("");
    const r = await fetch("/api/platform/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.email, password: form.password, modelIds: form.modelIds.split(",").map((v) => v.trim()).filter(Boolean), providerIds: form.providerIds.split(",").map((v) => v.trim()).filter(Boolean) }) });
    const j = await r.json(); setMessage(j.success ? "User created" : j.error); if (j.success) { setForm({ email: "", password: "", modelIds: "", providerIds: "" }); load(); }
  }
  return <main className="dashboard-page" style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}><h1>Users and access scopes</h1><p>Admin users manage accounts. Normal users only see their own API keys and assigned models/providers.</p><form onSubmit={create} style={{ display: "grid", gap: 10, maxWidth: 520 }}><input placeholder="User email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><input placeholder="Temporary password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><input placeholder="Allowed provider IDs (comma separated)" value={form.providerIds} onChange={(e) => setForm({ ...form, providerIds: e.target.value })} /><input placeholder="Allowed model IDs (comma separated)" value={form.modelIds} onChange={(e) => setForm({ ...form, modelIds: e.target.value })} /><button type="submit">Create user</button></form><p>{message}</p><section style={{ marginTop: 24 }}>{users.map((user) => <article key={user.id} style={{ padding: 12, border: "1px solid #ddd", marginBottom: 8, borderRadius: 8 }}><strong>{user.email}</strong> <span>({user.role})</span><div>Models: {user.scope?.model_ids?.join(", ") || "all"}</div><div>Providers: {user.scope?.provider_ids?.join(", ") || "all"}</div></article>)}</section></main>;
}
