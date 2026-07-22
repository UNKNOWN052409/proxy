/**
 * POST /api/accounts/test — Test if account credentials are valid
 */
import { accountStore } from "@/lib/accounts/store";

export async function POST(request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return Response.json({ success: false, error: "Account ID required" }, { status: 400 });
    }

    const account = accountStore.getById(id);
    if (!account) {
      return Response.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    // Test the account by making a simple API request
    const startTime = Date.now();

    try {
      // Use the account credentials to make a test request
      // For Kiro accounts, we'll make a simple models list request
      const testUrl = account.provider === "kiro"
        ? "https://api.kiro.ai/v1/models"
        : "https://api.openai.com/v1/models";

      const headers = {
        "Content-Type": "application/json",
      };

      // Add authentication based on authType
      if (account.authType === "bearer" && account.apiKey) {
        headers["Authorization"] = `Bearer ${account.apiKey}`;
      } else if (account.authType === "oauth" && account.accessToken) {
        headers["Authorization"] = `Bearer ${account.accessToken}`;
      }

      const response = await fetch(testUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const modelCount = data.data?.length || 0;

        return Response.json({
          success: true,
          valid: true,
          latency,
          message: `Account is valid (${modelCount} models available)`,
          details: {
            status: response.status,
            modelCount,
            provider: account.provider || "unknown",
          },
        });
      } else {
        const errorText = await response.text();
        return Response.json({
          success: true,
          valid: false,
          latency,
          message: `Authentication failed (${response.status})`,
          details: {
            status: response.status,
            error: errorText.slice(0, 200),
          },
        });
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return Response.json({
        success: true,
        valid: false,
        latency,
        message: error.message || "Connection failed",
        details: {
          error: error.name,
          message: error.message,
        },
      });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Test failed" },
      { status: 500 }
    );
  }
}
