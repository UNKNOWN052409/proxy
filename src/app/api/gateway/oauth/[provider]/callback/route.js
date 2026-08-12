import { NextResponse } from "next/server";
import { getGatewayProviders } from "@/lib/gateway/config";
import { exchangeOAuthCode } from "@/lib/gateway/oauth";

export const runtime = "nodejs";

function authorized(request) { return request.cookies.get("kp-auth")?.value === "authenticated"; }

export async function GET(request, { params }) {
  if (!authorized(request)) return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "OAuth callback requires code and state" }, { status: 400 });
  try {
    const provider = getGatewayProviders().find((entry) => entry.id === String(params.provider || "").toLowerCase());
    if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    const clientId = provider.oauthClientIdEnv ? process.env[provider.oauthClientIdEnv] : null;
    const clientSecret = provider.oauthClientSecretEnv ? process.env[provider.oauthClientSecretEnv] : null;
    const redirectUri = provider.oauthRedirectUri || `${url.origin}/api/gateway/oauth/${provider.id}/callback`;
    const result = await exchangeOAuthCode({ provider, code, state, clientId, clientSecret, redirectUri });
    return NextResponse.json({ ok: true, providerId: provider.id, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth callback failed" }, { status: 400 });
  }
}
