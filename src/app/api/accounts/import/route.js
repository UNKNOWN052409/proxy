/**
 * Legacy account/password import is intentionally disabled.
 * The compliant gateway accepts provider API keys and official OAuth tokens
 * through the gateway provider-management flow only.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    error: "Legacy account/password import is disabled",
    replacement: "/api/gateway/providers",
    allowed: ["explicit provider API keys", "official OAuth callback tokens", "AWS Bedrock SigV4 credentials"],
    rejected: ["passwords", "browser cookies", "session cookies", "private client tokens", "account dumps"],
  }, { status: 410 });
}
