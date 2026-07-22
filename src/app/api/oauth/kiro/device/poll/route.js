/**
 * GET /api/oauth/kiro/device/poll — Poll for device code token
 * Query params: clientId, clientSecret, deviceCode, region
 */

import { kiroOAuth } from "@/lib/kiro/oauth";
import { accountStore } from "@/lib/kiro/store";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const clientSecret = url.searchParams.get("clientSecret");
    const deviceCode = url.searchParams.get("deviceCode");
    const region = url.searchParams.get("region") || "us-east-1";
    const authMethod = url.searchParams.get("authMethod") || "builder-id";

    if (!clientId || !clientSecret || !deviceCode) {
      return Response.json({ error: "Missing required params" }, { status: 400 });
    }

    const result = await kiroOAuth.pollDeviceToken(clientId, clientSecret, deviceCode, region);

    if (!result.success) {
      if (result.pending) {
        return Response.json({ pending: true, error: result.error, errorDescription: result.errorDescription });
      }
      return Response.json({ error: result.error, errorDescription: result.errorDescription }, { status: 400 });
    }

    // Extract email from token
    const email = kiroOAuth.extractEmailFromJWT(result.tokens.accessToken);

    // Auto-save account
    const account = accountStore.add({
      email,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      provider: "kiro",
      authType: "oauth",
      source: `device-code-${authMethod}`,
      providerSpecificData: { authMethod, region },
      expiresAt: new Date(Date.now() + (result.tokens.expiresIn || 3600) * 1000).toISOString(),
      testStatus: "active",
      label: email || `Kiro ${authMethod}`,
    });

    return Response.json({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        label: account.label,
        provider: account.provider,
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
