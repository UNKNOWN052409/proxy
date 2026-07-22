/**
 * API route to manage Kiro accounts
 */

import { accountStore } from "@/lib/kiro/store";

export async function GET() {
  const accounts = accountStore.getAll();
  return Response.json({ accounts });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "add") {
      const account = accountStore.add(data);
      return Response.json({ success: true, account });
    }

    if (action === "remove") {
      const removed = accountStore.remove(data.id);
      return Response.json({ success: removed });
    }

    if (action === "import") {
      const result = accountStore.importFromProxy(data.json, data.source || "api-import");
      return Response.json({ success: true, ...result });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
