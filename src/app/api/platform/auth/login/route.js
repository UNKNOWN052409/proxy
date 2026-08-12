import { NextResponse } from "next/server";
import { authenticateUser, ensureAdmin } from "@/lib/platform/store";
import { createSession, sessionCookie } from "@/lib/platform/auth";
import { userConfig } from "@/lib/config/store";

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    if (!process.env.PLATFORM_ADMIN_EMAIL && !userConfig.hasPassword()) {
      ensureAdmin(email, password);
    }
    const user = authenticateUser(email, password);
    if (!user) return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(sessionCookie(createSession(user)));
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
