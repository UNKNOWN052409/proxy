import { getGatewayStatus } from "@/lib/gateway/config";
import { getGatewayDiagnostics } from "@/lib/gateway/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ success: true, ...getGatewayStatus(), diagnostics: getGatewayDiagnostics() });
  } catch (error) {
    return Response.json({ success: false, enabled: false, error: error.message, providers: [] }, { status: 500 });
  }
}
