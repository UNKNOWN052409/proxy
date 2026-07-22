/**
 * GET /api/usage — usage stats
 * POST /api/usage/record — record a usage entry (internal)
 */

import { usageStore } from "@/lib/usage/store";
import { TIME_PERIODS } from "@/lib/utils/format";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "7d";

  // Get days from period (e.g., "7d" -> 7, "1m" -> 30)
  const periodConfig = TIME_PERIODS.find(p => p.value === period);
  const days = periodConfig ? periodConfig.days : 7;

  const summary = usageStore.getSummary(days);
  return Response.json({ success: true, ...summary });
}
