/**
 * GET /api/usage — tenant usage dashboard data.
 * Admins may view global or selected user/key usage; users are restricted to their own owner scope.
 */
import { currentUser, requireRole } from "@/lib/platform/auth";
import { usageStore } from "@/lib/usage/store";
import { TIME_PERIODS } from "@/lib/utils/format";

function errorResponse(error) {
  const status = error.status || 500;
  return Response.json({ success: false, error: error.message || "Usage query failed" }, { status });
}

export async function GET(request) {
  try {
    const actor = await currentUser();
    requireRole(actor, ["admin", "user"]);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const periodConfig = TIME_PERIODS.find((periodItem) => periodItem.value === period);
    const days = periodConfig ? periodConfig.days : 7;
    const requestedUser = searchParams.get("userId");
    const requestedKey = searchParams.get("apiKeyId");
    const options = {};

    if (actor.role === "admin") {
      if (requestedUser) options.ownerUserId = Number(requestedUser);
      if (requestedKey) options.apiKeyId = Number(requestedKey);
    } else {
      options.ownerUserId = actor.id;
    }

    const summary = usageStore.getSummary(days, options);
    return Response.json({
      success: true,
      period,
      scope: actor.role === "admin" ? (requestedUser || requestedKey ? "filtered" : "global") : "owner",
      ...summary,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const actor = await currentUser();
    requireRole(actor, ["admin"]);
    const { searchParams } = new URL(request.url);
    const ownerUserId = searchParams.get("userId");
    const apiKeyId = searchParams.get("apiKeyId");
    const options = {};
    if (ownerUserId) options.ownerUserId = Number(ownerUserId);
    if (apiKeyId) options.apiKeyId = Number(apiKeyId);
    const deleted = usageStore.clear(options);
    return Response.json({ success: true, deleted });
  } catch (error) {
    return errorResponse(error);
  }
}

export { errorResponse };
