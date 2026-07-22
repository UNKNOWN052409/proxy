/**
 * POST /api/oauth/kiro/device/start — Start device authorization
 * GET  /api/oauth/kiro/device/poll — Poll for token
 */

import { kiroOAuth } from "@/lib/kiro/oauth";
import { accountStore } from "@/lib/kiro/store";

export async function POST(request) {
  try {
    const { region = "us-east-1", authMethod = "builder-id" } = await request.json();

    // Register client
    const client = await kiroOAuth.registerClient(region);

    // Determine startUrl based on auth method
    const startUrl = authMethod === "idc"
      ? "https://view.awsapps.com/start"
      : "https://view.awsapps.com/start#/builder-id";

    // Start device authorization
    const deviceAuth = await kiroOAuth.startDeviceAuthorization(
      client.clientId,
      client.clientSecret,
      startUrl,
      region
    );

    return Response.json({
      success: true,
      deviceCode: deviceAuth.deviceCode,
      userCode: deviceAuth.userCode,
      verificationUri: deviceAuth.verificationUri,
      verificationUriComplete: deviceAuth.verificationUriComplete,
      expiresIn: deviceAuth.expiresIn,
      interval: deviceAuth.interval,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      region,
      authMethod,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
