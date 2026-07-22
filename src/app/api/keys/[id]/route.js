// API Key Management - Individual Key Operations
// GET /api/keys/[id] - Get key details
// DELETE /api/keys/[id] - Revoke key
import { NextResponse } from "next/server";
import { getKey, revokeKey } from "@/lib/api-keys/store";

// GET - Get key details by ID
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const keyId = parseInt(id, 10);

    if (isNaN(keyId)) {
      return NextResponse.json(
        { success: false, error: "Invalid key ID" },
        { status: 400 }
      );
    }

    const key = getKey(keyId);

    if (!key) {
      return NextResponse.json(
        { success: false, error: "Key not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      key,
    });
  } catch (error) {
    console.error("Get key error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get key",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// DELETE - Revoke key (soft delete)
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const keyId = parseInt(id, 10);

    if (isNaN(keyId)) {
      return NextResponse.json(
        { success: false, error: "Invalid key ID" },
        { status: 400 }
      );
    }

    const revoked = revokeKey(keyId);

    if (!revoked) {
      return NextResponse.json(
        { success: false, error: "Key not found or already revoked" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Key revoked successfully",
    });
  } catch (error) {
    console.error("Revoke key error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to revoke key",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
