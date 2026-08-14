"use client";

import { Badge, Card } from "@/components/shared";

export default function LocalTrafficAdapterPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Local Traffic Adapter</h1>
        <p className="text-text-muted text-sm mt-1">Optional loopback-only compatibility guidance for traffic you own and control.</p>
      </div>

      <Card title="Supported boundary" icon="shield" subtitle="The API gateway remains server-to-server for external providers.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <Badge variant="success" size="sm">Supported</Badge>
            <p className="mt-3 text-sm font-medium text-text-main">User-owned local services</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">A local developer may point an application they control at the OpenAI-compatible gateway endpoint, normally <code className="font-mono text-text-main">http://127.0.0.1:2018/v1</code>, using a gateway API key.</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <Badge variant="error" size="sm">Not supported</Badge>
            <p className="mt-3 text-sm font-medium text-text-main">Third-party traffic interception</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">The gateway does not capture browser sessions, cookies, credentials, private headers, or HTTPS traffic for third-party websites, desktop clients, or provider domains.</p>
          </div>
        </div>
      </Card>

      <Card title="Use an authorized provider instead" icon="hub" subtitle="Supported accounts, OAuth connections, and API keys are encrypted and audited.">
        <div className="space-y-3 text-sm text-text-muted leading-relaxed">
          <p>Configure a provider through the Gateway or Accounts dashboard, connect an official OAuth/device flow where it is documented, or import an account API key or token only through the encrypted import workflow.</p>
          <p>For a custom API, use a documented and explicitly authorized server endpoint. The gateway validates its HTTPS/loopback origin and then can discover the exposed model catalog without turning browser or network traffic into credentials.</p>
        </div>
      </Card>

      <Card title="Client connection" icon="terminal" subtitle="No certificate installation or hosts-file changes are required.">
        <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-4 text-xs text-text-main">OPENAI_BASE_URL=http://127.0.0.1:2018/v1{"\n"}OPENAI_API_KEY=&lt;your-gateway-key&gt;</pre>
      </Card>
    </div>
  );
}
