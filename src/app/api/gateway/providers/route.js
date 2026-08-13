import { NextResponse } from "next/server";
import { getGatewayProviders, getGatewayStatus } from "@/lib/gateway/config";
import { getGatewayRuntimeState, importProviderModels, mergeProviderConfiguration, restoreGatewayRuntimeState, setProviderEnabled } from "@/lib/gateway/runtime-store";
import { importEncryptedCredentials, listCredentialMetadata } from "@/lib/gateway/credentials";
import { detectCustomEndpoint, testPromptTemplate } from "@/lib/gateway/custom-endpoint";
import { normalizeOpenCodeImport, describeOpenCodeImport } from "@/lib/gateway/opencode-import";

export const runtime = "nodejs";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requireDashboardSession(request) {
  return request.cookies.get("kp-auth")?.value === "authenticated";
}

export async function GET(request) {
  if (!requireDashboardSession(request)) return error("Dashboard authentication required", 401);
  return NextResponse.json(getGatewayStatus());
}

export async function POST(request) {
  if (!requireDashboardSession(request)) return error("Dashboard authentication required", 401);
  let body;
  try { body = await request.json(); } catch { return error("Request body must be valid JSON"); }
  const action = String(body?.action || "import");

  try {
    if (action === "preview_opencode_import") {
      const providers = normalizeOpenCodeImport(body.config || body);
      return NextResponse.json({ ok: true, providers: providers.map(({ id, label, type, baseUrl, prefix, models }) => ({ id, label, type, baseUrl, prefix: prefix || null, modelCount: models.length, models })) });
    }
    if (action === "import_opencode_config") {
      const before = getGatewayRuntimeState();
      const providers = normalizeOpenCodeImport(body.config || body);
      const results = mergeProviderConfiguration(providers.map(({ models, ...provider }) => provider));
      for (const provider of providers) {
        if (provider.models?.length) importProviderModels(provider.id, provider.models, { replace: body.replace === true });
      }
      try {
        getGatewayProviders();
      } catch (validationError) {
        restoreGatewayRuntimeState(before);
        throw validationError;
      }
      return NextResponse.json({ ok: true, results, preview: describeOpenCodeImport(body.config || body), status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "detect_custom") {
      const baseUrl = String(body.baseUrl || "").trim();
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
      const detection = await detectCustomEndpoint({
        baseUrl,
        apiKey,
        allowInsecureHttp: body.allowInsecureHttp === true,
        liveTest: false,
      });
      return NextResponse.json({ ok: true, detection });
    }
    if (action === "test_custom") {
      const baseUrl = String(body.baseUrl || "").trim();
      if (!baseUrl) return error("baseUrl is required");
      const result = await testPromptTemplate({
        endpointUrl: baseUrl,
        prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim().slice(0, 4000) : undefined,
        apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        method: body.method,
        allowInsecureHttp: body.allowInsecureHttp === true,
      });
      return NextResponse.json({ ok: result.ok, test: result }, { status: result.ok ? 200 : 502 });
    }
    if (action === "save_custom") {
      const providerId = String(body.providerId || "").trim().toLowerCase();
      const baseUrl = String(body.baseUrl || "").trim();
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!providerId || !baseUrl || !apiKey) return error("providerId, baseUrl, and an authorized API key are required");
      const before = getGatewayRuntimeState();
      const models = Array.isArray(body.models) ? body.models : [];
      const requestedType = String(body.providerType || body.type || "openai").trim().toLowerCase();
      if (!["openai", "anthropic"].includes(requestedType)) return error("Custom provider type must be openai or anthropic");
      const prefix = String(body.prefix || "").trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
      mergeProviderConfiguration({ providers: [{ id: providerId, label: body.label || providerId, prefix: prefix || undefined, type: requestedType, adapter: requestedType, baseUrl, models, insecureHttp: body.allowInsecureHttp === true, supportsTools: body.supportsTools === true, supportsVision: body.supportsVision === true }] });
      importEncryptedCredentials(providerId, [{ label: "custom-endpoint", apiKey }]);
      try {
        getGatewayProviders();
      } catch (validationError) {
        restoreGatewayRuntimeState(before);
        throw validationError;
      }
      return NextResponse.json({ ok: true, providerId, status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "import") {
      const before = getGatewayRuntimeState();
      const results = mergeProviderConfiguration(body.providers);
      try {
        getGatewayProviders();
      } catch (validationError) {
        restoreGatewayRuntimeState(before);
        throw validationError;
      }
      return NextResponse.json({ ok: true, results, status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "import_models") {
      const providerId = String(body.providerId || "").trim().toLowerCase();
      if (!providerId) return error("providerId is required");
      const provider = getGatewayProviders().find((candidate) => candidate.id === providerId);
      if (!provider) return error(`Unknown or unconfigured provider: ${providerId}`);
      const imported = importProviderModels(providerId, body.models, { replace: body.replace === true });
      return NextResponse.json({ ok: true, imported, status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "set_enabled") {
      const providerId = String(body.providerId || "");
      if (!providerId) return error("providerId is required");
      const setting = setProviderEnabled(providerId, body.enabled);
      return NextResponse.json({ ok: true, setting, status: getGatewayStatus() });
    }
    if (action === "import_credentials") {
      const providerId = String(body.providerId || "");
      const imported = importEncryptedCredentials(providerId, body.credentials);
      return NextResponse.json({ ok: true, imported, credentials: listCredentialMetadata(providerId), status: getGatewayStatus() }, { status: 201 });
    }
    if (action === "list_credentials") {
      const providerId = String(body.providerId || "");
      return NextResponse.json({ ok: true, credentials: listCredentialMetadata(providerId) });
    }
    return error("Unsupported action");
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Gateway provider update failed");
  }
}
