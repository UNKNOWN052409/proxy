/**
 * POST /api/config/auth/login — Verify password, set auth cookie
 */
import { userConfig } from "@/lib/config/store";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (!password) {
      return Response.json({ success: false, error: "Password required" }, { status: 400 });
    }

    // If no password set yet, this is the first setup
    if (!userConfig.hasPassword()) {
      userConfig.setPassword(password);
      const cookieStore = await cookies();
      cookieStore.set("kp-auth", "authenticated", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return Response.json({ success: true, setup: true });
    }

    // Verify existing password
    if (!userConfig.verifyPassword(password)) {
      return Response.json({ success: false, error: "Wrong password" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set("kp-auth", "authenticated", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
