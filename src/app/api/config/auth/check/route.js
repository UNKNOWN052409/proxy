/**
 * GET /api/config/auth/check — Check authentication status
 */
import { userConfig } from "@/lib/config/store";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic"; // Prevent caching
export const runtime = "nodejs"; // Faster runtime

export async function GET() {
  const hasPassword = userConfig.hasPassword();
  const cookieStore = await cookies();
  const authToken = cookieStore.get("kp-auth")?.value;

  let authenticated = false;
  if (!hasPassword) {
    authenticated = true; // no password = open access
  } else if (authToken === "authenticated") {
    authenticated = true;
  }

  return Response.json({ authenticated, hasPassword });
}
