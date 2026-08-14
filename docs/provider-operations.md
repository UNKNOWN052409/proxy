# Provider Operations and Routing Eligibility

The gateway dashboard exposes a **Provider access catalog** for every configured and supported provider. It reports only secret-free operational metadata, so administrators can manage routing without revealing API keys, bearer tokens, refresh tokens, or account session material.

| Dashboard field | Meaning |
|---|---|
| **Provider on / off** | The administrative activation setting for the provider. Turning a provider off prevents it from being selected for new routes and fallbacks. |
| **Routing eligible** | The provider is enabled, inside its activation window, not provider-quarantined, and has a usable authorized credential, workload identity, or documented local no-auth configuration. |
| **Credential blocked** | No imported credential can currently be selected. All entries are disabled, expired, rejected, rate-limited/cooling down, or quarantined. |
| **Expired** | The configured provider activation window is over. |
| **Quarantined** | Provider-level health or authenticity review has quarantined the provider. |
| **Models** | Locally configured and/or authorized model-discovery results. A displayed model is not an assertion that a third-party endpoint's claimed identity is genuine; health and authenticity checks remain separate evidence. |

## Account and credential-state counters

Each card displays the total imported encrypted account/credential count and the number currently ready. The **Attention** line separately reports disabled, expired, authentication-rejected, rate-limited, and quarantined entries.

> An authentication rejection means that the upstream returned an authorization failure for that credential. It is not presented as a definitive provider "ban" because an upstream provider can use the same status for revoked tokens, incorrect scopes, expired credentials, or account restrictions.

A verified successful credential check clears a temporary rejection state. Credentials are stored encrypted at rest; their values, tokens, and provider response bodies are never returned in dashboard operations data.

## Quota visibility

The gateway reports a provider's remaining quota only when the provider exposes it through an **official response header or documented telemetry API** that is configured for the account. When such telemetry is unavailable, the card intentionally displays **not exposed by this provider** rather than guessing usage, subscription limits, or billing information.

Gateway-owned controls still display the enforced tenant/API-key RPM and token budgets independently of upstream quota telemetry.

## Routing behavior

Before primary or fallback selection, the router excludes providers that are disabled, expired, provider-quarantined, OAuth-setup-only, or have no selectable authorized credential. This prevents requests from being sent to credentials already known to be blocked.

If a request becomes ineligible at execution time, the normal retry and allowed fallback policy continues to apply only among the remaining eligible providers. A requested explicit provider/model remains constrained by the caller's provider/model allowlist and will return an error rather than silently using an unauthorized provider.

## Administrative workflow

1. Import only user-owned API keys, official tokens, or approved account metadata through **Dashboard → Accounts → Import**.
2. Configure a provider and use **Test & import models** to perform its documented model-discovery check.
3. Use **Verify credentials** to update the encrypted pool status without exposing the secret.
4. Review routing eligibility and attention counts before turning the provider on.
5. Turn a provider off before planned maintenance, key rotation, or investigation. It will be immediately excluded from new routing decisions.

Browser cookies, passwords, captured private headers, and web-chat sessions are neither accepted nor used by provider operations or routing.
