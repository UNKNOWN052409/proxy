/**
 * Legacy account/password export is intentionally disabled.
 * The compliant gateway never serializes passwords, browser sessions, or
 * third-party account dumps into router-compatible files.
 */

export async function GET() {
  return Response.json({
    enabled: false,
    error: "Legacy account export is disabled",
    replacement: "/api/gateway/providers",
    note: "Use provider metadata/model catalog export only; secrets remain in the encrypted store.",
  }, { status: 410 });
}
