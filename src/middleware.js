/**
 * Middleware — protect dashboard routes behind auth check
 * Edge runtime compatible (no fs/path)
 */
import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Check auth cookie — if present, allow
  const authCookie = request.cookies.get("kp-auth")?.value;
  if (authCookie === "authenticated") {
    return NextResponse.next();
  }

  // Login page is always accessible
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
