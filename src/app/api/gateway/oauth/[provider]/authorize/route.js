import { NextResponse } from "next/server";
import { getGatewayProviders } from "@/lib/gateway/config";
import { createOAuthAuthorization } from "@/lib/gateway/oauth";

export const runtime = "nodejs";

function authorized(request) { return request.cookies.get("kp-auth")?.value === "authenticated"; }

export async function GET(request, { params }) {
  if (!authorized(request)) return NextResponse.json({ error: "Dashboard authentication required" }, { status: 401 });
  try {
    const provider = getGatewayProviders().find((entry) => entry.id === String(params.provider || "").toLowerCase());
    if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    const clientIdEnv = provider.oauthClientIdEnv;
    const clientId = clientIdEnv ? process.env[clientIdEnv] : null;
    const redirectUri = provider.oauthRedirectUri || `${new URL(request.url).origin}/api/gateway/oauth/${provider.id}/callback`;
    const result = createOAuthAuthorization({ provider, clientId, redirectUri });
    return NextResponse.json({ ok: true, providerId: provider.id, redirectUri, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth authorization setup failed" }, { status: 400 });
  }
}
