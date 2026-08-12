/**
 * Legacy account-import endpoint intentionally disabled.
 *
 * The compliant gateway accepts explicitly supplied API keys or official OAuth
 * tokens through /api/gateway/providers only. Browser cookies, private client
 * sessions, password exports, and third-party proxy account dumps are never
 * accepted or converted into API credentials.
 */

export async function POST() {
  return Response.json({
    error: "Legacy Kiro account import is disabled",
    replacement: "/api/gateway/providers",
    allowed: ["explicit API keys", "official OAuth callback tokens", "AWS Bedrock SigV4 credentials"],
    rejected: ["browser cookies", "session cookies", "passwords", "private client tokens", "third-party proxy account dumps"],
  }, { status: 410 });
}

export async function GET() {
  return Response.json({
    enabled: false,
    message: "Use the compliant gateway provider management flow; legacy account import is disabled.",
  }, { status: 410 });
}
