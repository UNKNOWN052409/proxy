/**
 * POST /api/accounts/test — verify an encrypted provider account or credential
 * against its configured gateway provider. No browser/session material, raw
 * secret input, or hardcoded third-party endpoint is accepted.
 */
import { NextResponse } from "next/server";
import { accountStore } from "@/lib/kiro/store";
import { currentUser, requireRole } from "@/lib/platform/auth";
import { getGatewayProviders, getGatewayStatus } from "@/lib/gateway/config";
import {
  verifyAuthorizedAccount,
  verifyStoredCredential,
} from "@/lib/gateway/credential-verification";

export const runtime = "nodejs";

function error(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function providerFor(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase();
  return getGatewayProviders().find((provider) => provider.id === normalized) || null;
}

function routingState(providerId) {
  const item = getGatewayStatus().providers?.find((provider) => provider.id === providerId);
  return {
    routingEligible: item?.operations?.routingEligible === true,
    routingReason: item?.operations?.routingReason || item?.availabilityReason || null,
    providerEnabled: item?.enabled !== false,
  };
}

function responseFromSummary(summary, providerId) {
  const valid = summary.status === "verified";
  return NextResponse.json({
    success: true,
    valid,
    latency: summary.durationMs,
    message: valid
      ? `Authorized ${providerId} credential verified${summary.model ? ` for ${summary.model}` : ""}`
      : `Credential test ${summary.status || "failed"}${summary.error ? `: ${summary.error}` : ""}`,
    details: {
      provider: providerId,
      accountId: summary.accountId || null,
      credentialId: summary.credentialId || null,
      status: summary.status,
      model: summary.model || null,
      ttftMs: summary.ttftMs,
      authenticityStatus: summary.authenticityStatus,
      identityVerdict: summary.identityVerdict,
      routing: routingState(providerId),
    },
  }, { status: valid ? 200 : 502 });
}

export async function POST(request) {
  let body;
  try {
    requireRole(await currentUser(), ["admin"]);
    body = await request.json();
  } catch (cause) {
    const status = Number(cause?.status || 0);
    return error(status === 401 || status === 403 ? cause.message : "Request body must be valid JSON", status === 401 || status === 403 ? status : 400);
  }

  const requestedModel = typeof body?.model === "string" ? body.model.trim().slice(0, 256) : undefined;
  const providerId = String(body?.providerId || "").trim().toLowerCase();

  try {
    if (body?.credentialId) {
      if (!providerId) return error("providerId is required when credentialId is supplied");
      const provider = providerFor(providerId);
      if (!provider) return error(`Provider ${providerId} is not configured`);
      const summary = await verifyStoredCredential(provider, String(body.credentialId).trim(), {
        model: requestedModel,
        probeCount: 1,
      });
      return responseFromSummary(summary, provider.id);
    }

    const accountId = String(body?.id || "").trim();
    if (!accountId) return error("Account ID required");
    const account = accountStore.getById(accountId);
    if (!account) return error("Account not found", 404);

    const resolvedProviderId = providerId || String(account.provider || "").trim().toLowerCase();
    const provider = providerFor(resolvedProviderId);
    if (!provider) {
      return error(`Provider ${resolvedProviderId || "for this account"} is not configured; add an authorized compatible endpoint before testing`, 409);
    }

    const summary = await verifyAuthorizedAccount(provider, account, {
      model: requestedModel,
      probeCount: 1,
    });

    // Persist only secret-free operational metadata for the account list.
    accountStore.update(account.id, {
      lastVerification: {
        checkedAt: summary.checkedAt,
        status: summary.status,
        model: summary.model || null,
        durationMs: summary.durationMs,
        ttftMs: summary.ttftMs,
        error: summary.error ? String(summary.error).slice(0, 240) : null,
      },
    });

    return responseFromSummary(summary, provider.id);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Account verification failed", 500);
  }
}

export const __testables = { responseFromSummary, routingState };
