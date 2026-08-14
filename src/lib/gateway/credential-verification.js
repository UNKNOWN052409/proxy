import { auditProviderEndpoint } from "./audit.js";
import {
  getCredentialForVerification,
  markCredentialResult,
  recordCredentialVerification,
} from "./credentials.js";

function modelFor(provider, requestedModel) {
  return String(
    requestedModel
      || provider.defaultModel
      || provider.models?.[0]?.id
      || provider.models?.[0]
      || "",
  ).trim() || undefined;
}

function safeVerificationSummary({ credentialId = null, audit, durationMs, model }) {
  const status = audit.authenticity?.status === "quarantined"
    ? "quarantined"
    : audit.error
      ? "failed"
      : "verified";

  return {
    credentialId,
    status,
    checkedAt: audit.checkedAt,
    model: audit.advertisedModel || model || null,
    authenticityScore: audit.authenticity?.score ?? null,
    authenticityStatus: audit.authenticity?.status || null,
    ttftMs: audit.authenticity?.ttftMs ?? null,
    modelListStatus: audit.modelListStatus,
    probeStatus: audit.probeStatus,
    canaryFailures: audit.authenticity?.failedCanaries ?? null,
    contextFailures: audit.authenticity?.failedContexts ?? null,
    leakage: audit.leakage?.findings || [],
    identityVerdict: audit.identity?.verdict || null,
    durationMs,
    error: audit.error || null,
  };
}

function safeFailureSummary({ credentialId = null, model, started, cause }) {
  return {
    credentialId,
    status: "failed",
    checkedAt: new Date().toISOString(),
    model: model || null,
    authenticityScore: 0,
    authenticityStatus: "failed",
    ttftMs: null,
    durationMs: Date.now() - started,
    error: cause instanceof Error ? cause.message : "Verification failed",
  };
}

/**
 * Verifies one encrypted credential selected by ID. Secrets are resolved only
 * inside this process and never included in the returned summary.
 */
export async function verifyStoredCredential(provider, credentialId, options = {}) {
  const started = Date.now();
  const model = modelFor(provider, options.model);
  try {
    const credential = getCredentialForVerification(provider.id, credentialId);
    if (!credential) throw new Error("Credential not found");
    if (credential.expired) throw new Error("Credential is expired");
    const audit = await auditProviderEndpoint({
      provider,
      apiKey: credential.apiKey,
      model,
      probeCount: Math.max(1, Math.min(5, Number(options.probeCount || 2))),
      contextSizes: Array.isArray(options.contextSizes) ? options.contextSizes.slice(0, 3) : [],
    });
    if (audit.modelResponse?.status) markCredentialResult(provider.id, credentialId, audit.modelResponse.ok, audit.modelResponse.status);
    const summary = safeVerificationSummary({ credentialId, audit, durationMs: Date.now() - started, model });
    recordCredentialVerification(provider.id, credentialId, summary);
    return summary;
  } catch (cause) {
    const summary = safeFailureSummary({ credentialId, model, started, cause });
    markCredentialResult(provider.id, credentialId, false, null);
    recordCredentialVerification(provider.id, credentialId, summary);
    return summary;
  }
}

/**
 * Verifies an explicitly selected encrypted OAuth/API account token. The token
 * is supplied by a trusted server-side store and is never returned to callers.
 */
export async function verifyAuthorizedAccount(provider, account, options = {}) {
  const started = Date.now();
  const model = modelFor(provider, options.model);
  const accountId = String(account?.id || "").trim() || null;
  try {
    if (!accountId) throw new Error("Account not found");
    if (account?.active === false) throw new Error("Account is disabled");
    if (account?.expiresAt && Date.parse(account.expiresAt) <= Date.now()) throw new Error("Account is expired");
    const token = typeof account?.accessToken === "string" && account.accessToken.trim()
      ? account.accessToken.trim()
      : (typeof account?.refreshToken === "string" && account.refreshToken.trim() ? account.refreshToken.trim() : "");
    if (!token) throw new Error("Account has no usable authorized token");

    const audit = await auditProviderEndpoint({
      provider,
      apiKey: token,
      model,
      probeCount: Math.max(1, Math.min(5, Number(options.probeCount || 1))),
      contextSizes: Array.isArray(options.contextSizes) ? options.contextSizes.slice(0, 3) : [],
    });
    return { accountId, ...safeVerificationSummary({ audit, durationMs: Date.now() - started, model }) };
  } catch (cause) {
    return { accountId, ...safeFailureSummary({ model, started, cause }) };
  }
}

export const __testables = { modelFor, safeVerificationSummary, safeFailureSummary };
