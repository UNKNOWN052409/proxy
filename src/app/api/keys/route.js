// API Key Management Routes
// GET /api/keys - List all keys
// POST /api/keys - Create new key
import { NextResponse } from "next/server";
import { generateApiKey } from "@/lib/api-keys/generator";
import { currentUser, requireRole } from "@/lib/platform/auth";
import { getScope } from "@/lib/platform/store";
import { createKey, listKeys } from "@/lib/api-keys/store";

// GET - List all API keys (non-revoked by default)
export async function GET(request) {
  try {
    const actor = await currentUser();
    requireRole(actor, ["admin", "user"]);
    const { searchParams } = new URL(request.url);
    const includeRevoked = searchParams.get("includeRevoked") === "true";
    const includeExpired = searchParams.get("includeExpired") === "true";

    const keys = listKeys({ includeRevoked, includeExpired }).filter((key) => actor.role === "admin" || key.owner_user_id === actor.id);

    return NextResponse.json({
      success: true,
      keys,
      count: keys.length,
    });
  } catch (error) {
    console.error("List keys error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list keys",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST - Create new API key
export async function POST(request) {
  try {
    const actor = await currentUser();
    requireRole(actor, ["admin", "user"]);
    const body = await request.json();
    const { name, expiresInDays = 365, providerIds = [], modelIds = [], rpmLimit = 0, tokenLimit = 0, profileSlug = null } = body;
    if (!Array.isArray(providerIds) || !Array.isArray(modelIds) || providerIds.length > 100 || modelIds.length > 200) {
      return NextResponse.json({ success: false, error: "Invalid scope lists" }, { status: 400 });
    }
    if (!Number.isInteger(rpmLimit) || rpmLimit < 0 || rpmLimit > 100000 || !Number.isInteger(tokenLimit) || tokenLimit < 0 || tokenLimit > 100000000) {
      return NextResponse.json({ success: false, error: "rpmLimit/tokenLimit are outside allowed bounds" }, { status: 400 });
    }
    if (profileSlug !== null && (typeof profileSlug !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(profileSlug))) {
      return NextResponse.json({ success: false, error: "Invalid profileSlug" }, { status: 400 });
    }

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { success: false, error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }

    // Validate expiresInDays
    if (typeof expiresInDays !== "number" || expiresInDays < 1 || expiresInDays > 3650) {
      return NextResponse.json(
        { success: false, error: "expiresInDays must be between 1 and 3650" },
        { status: 400 }
      );
    }

    // Generate key
    const keyData = generateApiKey({ name: name.trim(), expiresInDays });
    keyData.owner_user_id = actor.id;
    const allowed = actor.role === "admin" ? { provider_ids: providerIds, model_ids: modelIds } : getScope(actor.id);
    keyData.provider_ids = actor.role === "admin" ? providerIds : providerIds.filter((id) => allowed.provider_ids.includes(id));
    keyData.model_ids = actor.role === "admin" ? modelIds : modelIds.filter((id) => allowed.model_ids.includes(id));
    keyData.rpm_limit = rpmLimit;
    keyData.token_limit = tokenLimit;
    keyData.profile_slug = profileSlug || null;
    if (actor.role === "user" && (keyData.provider_ids.length !== providerIds.length || keyData.model_ids.length !== modelIds.length)) {
      return NextResponse.json({ success: false, error: "Requested scope exceeds your assigned permissions" }, { status: 403 });
    }

    // Store key (hashed)
    const storedKey = createKey(keyData);

    // Return key data (includes plaintext key - only shown once)
    return NextResponse.json({
      success: true,
      key: keyData.key, // Plaintext key - save this!
      metadata: storedKey, // Key metadata without plaintext
    });
  } catch (error) {
    console.error("Create key error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create key",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
