// POST /api/accounts/import - Import accounts from various formats
import { NextResponse } from "next/server";
import { importAccounts } from "@/lib/accounts/import";
import { accountStore } from "@/lib/accounts/store";

export async function POST(request) {
  try {
    // Parse multipart form data or JSON
    const contentType = request.headers.get("content-type") || "";

    let data;
    let format = "auto";

    if (contentType.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No file provided" },
          { status: 400 }
        );
      }

      // Read file content
      const text = await file.text();

      try {
        data = JSON.parse(text);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: "Invalid JSON file" },
          { status: 400 }
        );
      }

      // Get format from form data if provided
      format = formData.get("format") || "auto";
    } else if (contentType.includes("application/json")) {
      // Handle JSON body
      const body = await request.json();
      data = body.data || body;
      format = body.format || "auto";
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported content type" },
        { status: 400 }
      );
    }

    // Validate data
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid data format" },
        { status: 400 }
      );
    }

    // Import accounts using the library
    const importResult = importAccounts(data, format);

    if (!importResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: importResult.error,
          details: importResult.errors,
        },
        { status: 400 }
      );
    }

    // Store accounts in database
    const bulkResult = accountStore.bulkImport(
      importResult.accounts,
      importResult.detectedFormat
    );

    return NextResponse.json({
      success: true,
      imported: bulkResult.success,
      failed: bulkResult.failed,
      format: importResult.detectedFormat,
      errors: bulkResult.errors,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
