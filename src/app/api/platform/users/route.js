import { NextResponse } from "next/server";
import { createUser, listUsers, setUserActive, setScope, getScope } from "@/lib/platform/store";
import { currentUser, requireRole } from "@/lib/platform/auth";

export async function GET() {
  try {
    const actor = requireRole(await currentUser(), ["admin"]);
    return NextResponse.json({ success: true, users: listUsers().map((user) => ({ ...user, scope: getScope(user.id) })), actor });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const body = await request.json();
    const user = createUser({ email: body.email, password: body.password, role: body.role || "user" });
    const scope = setScope(user.id, { providerIds: body.providerIds || [], modelIds: body.modelIds || [], rpmLimit: body.rpmLimit, tokenLimit: body.tokenLimit, activeFrom: body.activeFrom, activeUntil: body.activeUntil, profileSlug: body.profileSlug });
    return NextResponse.json({ success: true, user, scope }, { status: 201 });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 400 }); }
}

export async function PATCH(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const body = await request.json();
    if (!body.userId) throw new Error("userId required");
    if (body.active !== undefined) setUserActive(body.userId, body.active);
    const existing = getScope(body.userId);
    const scope = setScope(body.userId, { providerIds: body.providerIds ?? existing.provider_ids, modelIds: body.modelIds ?? existing.model_ids, rpmLimit: body.rpmLimit ?? existing.rpm_limit, tokenLimit: body.tokenLimit ?? existing.token_limit, activeFrom: body.activeFrom ?? existing.active_from, activeUntil: body.activeUntil ?? existing.active_until, profileSlug: body.profileSlug ?? existing.profile_slug });
    return NextResponse.json({ success: true, scope });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 400 }); }
}
