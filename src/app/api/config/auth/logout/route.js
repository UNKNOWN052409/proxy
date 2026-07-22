/**
 * POST /api/config/auth/logout — Clear auth cookie
 */
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("kp-auth");
  return Response.json({ success: true });
}
