# Proxy Completeness Audit

**Audit date:** 2026-08-12  
**Repository:** `UNKNOWN052409/proxy` local clone  
**Scope:** Both pasted requirement files, the current `feat/compliant-gateway` branch, runtime entrypoints, dashboard/API surfaces, legacy adapter code, and test/build behavior.

## Executive assessment

The repository contains a working **compliant gateway core** and a working **local runtime layer**, but it is not complete parity with the pasted 9Router/OmniRoute-style product request. The new gateway is real code rather than a UI-only mock for provider routing, encrypted API-key pools, model refresh, endpoint auditing, port fallback, and the authenticated dashboard boundary. Several requested features remain partial because they are generic rather than provider-specific, schedule-dependent rather than built-in, or only validated against local mock endpoints. Other requested features—browser-cookie conversion, third-party session extraction, free-tier bypass, and account/session pooling—are explicitly not implemented.

## Status legend

| Status | Meaning |
|---|---|
| **Complete** | Implemented in active code and covered by focused or runtime validation within its stated boundary. |
| **Partial** | A safe subset exists, but the requested breadth, provider coverage, UI, or automation is missing. |
| **Mock/local-only** | Behavior is exercised only by deterministic local fixtures or a local test server; real-provider behavior remains unverified. |
| **Incomplete** | The requested feature has no complete active implementation or has a known failing path. |
| **Intentionally excluded** | Not implemented by design because the requested behavior depends on credential/session extraction, access-control bypass, or unsafe public exposure. |

## Feature matrix

| Requested capability | Status | Evidence and limitation |
|---|---|---|
| Authenticated OpenAI-compatible `/v1/models` and `/v1/chat/completions` gateway | **Complete** | Active routes use `executeGatewayChat`, gateway API-key validation, provider resolution, normalized responses, and local end-to-end forwarding. Streaming is supported through the Next route; the standalone API-only runtime currently rejects streaming. |
| Anthropic-compatible upstream adapter | **Complete within generic adapter boundary** | `src/lib/gateway/providers/anthropic.js` is active through the provider registry. Real Anthropic credentials were not used in this audit. |
| Generic custom OpenAI-compatible endpoint | **Partial** | Explicit provider metadata and HTTPS/loopback URL validation work. There is no automatic schema discovery or arbitrary protocol conversion. |
| Generic custom Anthropic-compatible endpoint | **Partial** | Explicit type selection works; automatic detection and provider-specific OAuth do not. |
| Automatic non-OpenAI structure detection and conversion | **Incomplete** | The active gateway accepts only provider types `openai` and `anthropic`. It does not inspect an unknown endpoint and infer its schema. |
| Qwen, Kimi, ChatGPT, Grok, GitLab, Lovable, and similar dedicated adapters | **Partial / legacy-only** | Legacy `src/mitm/handlers/` contains several provider handlers, but the active gateway registry supports only `openai` and `anthropic`, and the legacy MITM server is not referenced by the active entrypoints. No real provider E2E validation was performed. |
| Local OpenCode-style or local OpenAI-compatible adapter | **Partial** | Loopback HTTP is allowed by URL validation, but the active resolver still requires an API key from an environment variable or encrypted pool. A truly no-auth local upstream is therefore not currently supported. |
| Public gateway no-auth access | **Incomplete and correctly protected** | The standalone gateway requires a valid `SK-proxy-...` Bearer key. This is intentional: local upstream no-auth and public gateway no-auth are separate concerns. |
| Authorized API-key credential import | **Complete within API-key boundary** | AES-256-GCM encrypted pool, file mode `0600`, bounded entries, append/merge behavior, metadata-only listing, LRU selection, expiry, and cooldown handling are implemented. Requires `GATEWAY_CREDENTIAL_MASTER_KEY`. |
| Official OAuth token import | **Incomplete** | No generic OAuth provider flow is implemented. The existing UI has a Kiro/AWS device-code path, but this audit did not validate a live OAuth exchange and it does not cover ChatGPT, Qwen, Kimi, Grok, or other providers. |
| Browser-cookie/session-to-API conversion | **Intentionally excluded** | Gateway status explicitly reports `cookieImport: false`; runtime sanitization rejects cookie/session/password fields. |
| Third-party MITM session interception | **Intentionally excluded from active gateway** | Legacy MITM code remains in `src/mitm/`, but no active entrypoint references it. The new gateway does not intercept browser login/session traffic or extract tokens. |
| Local authorized debugging proxy | **Incomplete** | The repository retains legacy MITM implementation, but there is no completed, isolated, opt-in local-debug command with a tested local certificate lifecycle in the new gateway. |
| Account pooling/rotation | **Partial** | Authorized API-key pooling and cooldown-based failover are real. Browser accounts, password accounts, cookies, and session pools are not supported. |
| 401/403/429 cooldown and success reset | **Complete for encrypted API-key pool** | `credentials.js` records failures, cools down on 401/403/429 or repeated failures, resets on success, and selects the least-recently-used ready key. |
| Banned-account removal and “turn off available/unavailable” toggles | **Incomplete** | Provider enable/disable exists, but there is no account-level banned removal workflow or requested toggle set. |
| Token-expiry notices | **Partial** | Provider expiry metadata and notifications are implemented. Per-account OAuth/session-token expiry detection is not. |
| Daily model list refresh | **Partial** | Manual route and `npm run gateway:refresh-models` are real and use documented model-list requests. A host cron or platform scheduler must run the job; no resident scheduler is included. |
| Model list in dashboard | **Complete within configured-provider scope** | Refreshed gateway catalogs are merged into the model browser without removing legacy model entries. |
| Endpoint activity/identity audit | **Complete as evidence-based audit, not proof** | Authenticated audit route checks model metadata consistency, safe routing headers, leakage indicators, and split timings. It cannot mathematically prove a hidden backend model when the upstream hides identity. |
| System-prompt audit | **Partial by design** | The layer detects output indicators of prompt leakage and credential-like material. It does not and should not extract or persist a provider’s hidden system prompt. |
| Real backside model discovery | **Partial / mock-local validated** | A local integration test detects a deliberately mismatched returned model. Real providers may omit or falsify metadata, so the result is a confidence/evidence verdict, not definitive attribution. |
| Vision for non-vision models | **Partial / opt-in** | Configured vision fallback can preprocess bounded inline images through an authorized vision provider. It is not a universal vision capability and has no real-provider image E2E test in this audit. |
| Tool calling for non-tool models | **Complete within client-managed boundary** | The compatibility layer validates and returns tool-call objects without executing arbitrary functions. It does not magically make the upstream reason over tools or execute them server-side. |
| Claude Code/Codex Desktop/Hermes/OMP/Pimono/Open Claude integrations | **Partial** | Generic OpenAI-compatible setup guidance exists. Dedicated client configuration and end-to-end validation for each named application are not implemented. |
| Usage metrics | **Partial** | Counts, success rate, average latency, and provider reliability are present. A full 9Router-style interactive graph and comprehensive cost/token dashboard are not complete. |
| Port fallback | **Complete** | Next and standalone gateway prefer localhost port `2018` and select the next free port. A real smoke test occupied `2018`, observed selection of `2019`, and received a successful `/health` response. |
| Loopback safety | **Complete within default boundary** | Default bind is `127.0.0.1`; non-loopback binding requires `GATEWAY_ALLOW_LAN=true`. Public deployment still needs operator hardening. |
| 0.1 CPU / 30 MB package / 100 MB RAM target | **Unverified** | Lightweight API-only mode exists, but no resource benchmark or concurrency/load test proves these exact limits. Node, Next, SQLite, and dependencies may exceed them. |
| No web scraping | **Verified by dependency/source scan for active gateway** | No Playwright/Puppeteer/Cheerio-style scraping dependency or active gateway scraping path was found. Legacy MITM and account code remain in the repository and require separate cleanup if the repository must be free of all legacy code. |
| Import should merge rather than erase old entries | **Complete for gateway metadata and API-key pools** | Runtime provider import is merge-only and credential import appends to the encrypted pool. Legacy password-account store/import is a separate path and currently fails tests. |
| Dashboard/UI enhancement | **Partial** | Gateway and Endpoint pages have live status, import, audit, refresh, expiry, and setup surfaces. The older Import Accounts page still exposes legacy account/password examples and Kiro-specific device-code UI; the overall product does not have full parity with the requested UI. |

## Validation evidence

The focused gateway suite passed **13/13** tests. Those tests cover configuration gates, merge-only sanitization, model-refresh parsing, tool compatibility, vision fallback, response normalization, endpoint-audit leakage and mismatch detection, encrypted credential round-tripping, and port normalization/fallback. The audit integration test uses a local HTTP server, not a real external provider.

The production build passed with exit code `0`. Next reported a middleware-convention deprecation warning and an NFT tracing warning, but compilation succeeded.

A standalone runtime smoke test occupied `127.0.0.1:2018`; the gateway logged `Gateway listening at http://127.0.0.1:2019`, and `GET /health` returned `ok: true`. A separate local end-to-end test used a real generated gateway API key, a local authorized mock upstream, and the active standalone gateway. It received HTTP 200 for `/v1/models` and `/v1/chat/completions`, and returned the mock upstream completion text.

The compiled Next runtime served `/login` with HTTP 200 and redirected unauthenticated `/dashboard/gateway` requests to `/login?redirect=%2Fdashboard%2Fgateway`. Unauthenticated provider-management and refresh requests returned HTTP 401. The public status endpoint returned HTTP 200 with sanitized provider and capability status.

The full repository command ran **129 tests: 111 passed, 18 failed**. The failures are not all the same issue. The account import/parser and account export/store groups fail because the legacy account path uses `DatabaseSync.transaction`, which is unavailable in the current Node runtime, and because the format/parser expectations conflict with the current implementation. Tier-detection caching and batch tests also fail because the legacy account store cannot persist/update the required records. These are genuine incomplete or broken legacy paths, not evidence that the gateway tests passed.

## Mock versus real behavior

The endpoint-audit mismatch test and the end-to-end gateway forwarding test are **real local integration tests**, but they are still mock-provider tests. No live OpenAI, Anthropic, Qwen, Kimi, Grok, ChatGPT, GitLab, Lovable, or OAuth provider was contacted. Therefore, provider-specific compatibility, rate-limit behavior, model catalog accuracy, OAuth redirect behavior, and hidden-backend attribution remain unverified.

The dashboard is not a static mock for the new gateway surfaces: it calls real API routes. However, the older Import Accounts page contains demonstration JSON and a Kiro-specific device-code workflow; it should not be interpreted as a universal provider/OAuth implementation.

## Bottom line

The active gateway is functional for explicit OpenAI/Anthropic-compatible providers, encrypted authorized API-key pools, local port fallback, model refresh, endpoint evidence auditing, and the enhanced dashboard. The project is **not complete** for the original full request because dedicated provider adapters, generic OAuth, schema autodetection, account-level controls, named desktop integrations, true no-auth local upstreams, full graph analytics, scheduler residency, resource benchmarks, and the legacy account store remain partial or incomplete. Cookie/session conversion, third-party session MITM, and free-tier bypass are intentionally absent.
