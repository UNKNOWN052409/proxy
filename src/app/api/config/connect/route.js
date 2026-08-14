import { buildConnection, listProfiles } from "@/lib/gateway/cli-profiles";
import { userConfig } from "@/lib/config/store";

export async function GET() {
  return Response.json({ profiles: listProfiles(), gateway: { baseUrl: `http://127.0.0.1:${userConfig.get().port || 2018}/v1`, authRequired: true } });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = buildConnection({
      profileId: body.profile || body.profileId || "custom",
      baseUrl: body.baseUrl,
      model: body.model || null,
      apiKeyEnv: body.apiKeyEnv || null,
      gatewayUrl: body.gatewayUrl || null,
    });
    return Response.json({ success: true, setup: config, connection: config });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Invalid connection profile" }, { status: 400 });
  }
}
