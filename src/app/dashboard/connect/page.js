"use client";
import { useState } from "react";

export default function ConnectPage() {
  const [hostname, setHostname] = useState("");
  const [result, setResult] = useState(null);
  async function connect(e) {
    e.preventDefault();
    const response = await fetch("/api/platform/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hostname }) });
    setResult(await response.json());
  }
  return <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}><h1>Connect a domain</h1><p>Enter your domain. The gateway validates it and shows the DNS/Tunnel step. It does not silently change your DNS provider.</p><form onSubmit={connect} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input required placeholder="api.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} style={{ flex: 1, minWidth: 240 }} /><button type="submit">Connect</button></form>{result && <pre style={{ whiteSpace: "pre-wrap", marginTop: 20, padding: 16, borderRadius: 8, background: "#f5f5f5" }}>{JSON.stringify(result, null, 2)}</pre>}</main>;
}
