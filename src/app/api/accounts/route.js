/**
 * Admin-only management for explicitly authorized provider credentials.
 * Browser cookies, passwords, session tokens, and account dumps are rejected.
 */

import { accountStore } from "@/lib/kiro/store";
import { currentUser, requireRole } from "@/lib/platform/auth";

function forbiddenResponse(error) {
  return Response.json({ error: error.message }, { status: error.status || 403 });
}

export async function GET() {
  try {
    requireRole(await currentUser(), ["admin"]);
    return Response.json({ accounts: accountStore.getAll().map(({ accessToken, refreshToken, ...safe }) => safe) });
  } catch (error) {
    return forbiddenResponse(error);
  }
}

export async function POST(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const body = await request.json();
    const { action, ...data } = body || {};

    if (action === "add") {
      if (data.password || data.cookie || data.cookies || data.session || data.sessionToken || data.headers) {
        return Response.json({ success: false, error: "Only explicit API keys or official OAuth tokens are accepted" }, { status: 400 });
      }
      if (!data.accessToken && !data.refreshToken) {
        return Response.json({ success: false, error: "accessToken or refreshToken is required" }, { status: 400 });
      }
      const account = accountStore.add({ ...data, source: data.source || "admin" });
      return Response.json({ success: true, account: { ...account, accessToken: undefined, refreshToken: undefined } });
    }

    if (action === "remove") {
      const removed = accountStore.remove(data.id);
      return Response.json({ success: removed });
    }

    if (action === "import") {
      const result = accountStore.importFromProxy(data.json, data.source || "authorized-token-import");
      return Response.json({ success: result.failed === 0, ...result });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return forbiddenResponse(error);
  }
}
