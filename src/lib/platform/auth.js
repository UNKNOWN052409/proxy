import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser } from "./store.js";

const COOKIE = "platform-session";
const SECRET = process.env.PLATFORM_SESSION_SECRET || process.env.GATEWAY_SESSION_SECRET || "development-only-change-me";

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.id || data.exp < Date.now()) return null;
    return getUser(data.id);
  } catch { return null; }
}

export async function currentUser() {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export function sessionCookie(token) {
  return { name: COOKIE, value: token, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 };
}

export function requireRole(user, roles = ["admin"]) {
  if (!user || !roles.includes(user.role)) {
    const error = new Error("Forbidden");
    error.status = user ? 403 : 401;
    throw error;
  }
  return user;
}
