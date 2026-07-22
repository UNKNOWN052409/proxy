// API Key Management Routes
// GET /api/keys - List all keys
// POST /api/keys - Create new key
import { NextResponse } from "next/server";
import { generateApiKey } from "@/lib/api-keys/generator";
import { createKey, listKeys } from "@/lib/api-keys/store";

// GET - List all API keys (non-revoked by default)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeRevoked = searchParams.get("includeRevoked") === "true";
    const includeExpired = searchParams.get("includeExpired") === "true";

    const keys = listKeys({ includeRevoked, includeExpired });

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
    const body = await request.json();
    const { name, expiresInDays = 365 } = body;

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
