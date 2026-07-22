/**
 * GET /api/quota — List all quotas
 * POST /api/quota — Create or update quota
 * DELETE /api/quota — Remove quota
 */

import { quotaStore } from "@/lib/quota/store";

export async function GET() {
  try {
    const quotas = quotaStore.getAll();
    return Response.json({ success: true, quotas });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, id, type, limits, policy } = body;

    if (action === "set") {
      const quota = quotaStore.setQuota({ id, type, limits, policy });
      return Response.json({ success: true, quota });
    }

    if (action === "check") {
      const result = quotaStore.checkQuota(id);
      return Response.json({ success: true, ...result });
    }

    if (action === "clear") {
      quotaStore.clearUsage(id);
      return Response.json({ success: true, message: "Usage cleared" });
    }

    return Response.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { success: false, error: "ID required" },
        { status: 400 }
      );
    }

    quotaStore.remove(id);
    return Response.json({ success: true, message: "Quota removed" });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
