import { NextResponse } from "next/server";
import { connectDomain, getDomain, listDomains } from "@/lib/platform/store";
import { currentUser, requireRole } from "@/lib/platform/auth";

export async function GET() {
  try {
    const actor = requireRole(await currentUser(), ["admin", "user"]);
    const domains = listDomains().filter((domain) => actor.role === "admin" || domain.user_id === actor.id);
    return NextResponse.json({ success: true, domains });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const actor = requireRole(await currentUser(), ["admin", "user"]);
    const { hostname } = await request.json();
    const domain = connectDomain({ hostname, userId: actor.id });
    return NextResponse.json({
      success: true,
      domain,
      next: {
        dns: `Create the DNS record required by your NGINX, Cloudflare Tunnel, or hosting provider for ${domain.hostname}`,
        verification: `Publish TXT _gateway-verify.${domain.hostname} with value ${domain.verification_token}`,
      },
    }, { status: 201 });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 400 }); }
}

export async function PATCH(request) {
  try {
    requireRole(await currentUser(), ["admin"]);
    const { hostname } = await request.json();
    const domain = getDomain(hostname);
    if (!domain) return NextResponse.json({ success: false, error: "Domain not found" }, { status: 404 });
    return NextResponse.json({ success: true, domain, note: "DNS verification is intentionally explicit; the service does not alter your DNS provider." });
  } catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 }); }
}
