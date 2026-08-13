import { NextResponse } from "next/server";
import { getGatewayProviders } from "@/lib/gateway/config";
import { pollOAuthDeviceAuthorization, startOAuthDeviceAuthorization } from "@/lib/gateway/oauth";

export const runtime = "nodejs";

function authorized(request) {
  return request.cookies.get("kp-auth")?.value === "authenticated";
}

function getProvider(params) {
  return getGatewayProviders().find((entry) => entry.id === String(params.provider || "").toLowerCase());
}

function credentialsFor(provider) {
  return {
    clientId: (provider.oauthClientIdEnv ? process.env[provider.oauthClientIdEnv] : null) || provider.oauthClientId || null,
    clientSecret: provider.oauthClientSecretEnv ? process.env[provider.oauthClientSecretEnv] : null,
  };
}

export async function POST(request, { params }) {
  if (!authorized(request)) return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
  try {
    const provider = getProvider(params);
    if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "start").trim().toLowerCase();
    const { clientId, clientSecret } = credentialsFor(provider);
    if (action === "start") {
      const result = await startOAuthDeviceAuthorization({ provider, clientId, clientSecret });
      return NextResponse.json({ ok: true, providerId: provider.id, ...result });
    }
    if (action === "poll") {
      const state = String(body?.state || "").trim();
      if (!state) return NextResponse.json({ error: "Device authorization state is required" }, { status: 400 });
      const result = await pollOAuthDeviceAuthorization({ provider, state, clientId, clientSecret });
      return NextResponse.json({ ok: true, providerId: provider.id, ...result });
    }
    return NextResponse.json({ error: "Unsupported device authorization action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Device authorization failed" }, { status: 400 });
  }
}
