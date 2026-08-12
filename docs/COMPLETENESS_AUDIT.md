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
| Official OAuth token import | **Complete as a configurable official OAuth boundary** | Authenticated authorization and callback routes now support documented authorization-code providers, short-lived state, token exchange, and encrypted access-token storage. Provider-specific endpoint/client configuration and live exchange remain credential-dependent; undocumented Kiro session/device flows are not used. |
| Browser-cookie/session-to-API conversion | **Intentionally excluded** | Gateway status explicitly reports `cookieImport: false`; runtime sanitization rejects cookie/session/password fields. |
| Third-party MITM session interception | **Intentionally excluded from active gateway** | Legacy MITM code remains in `src/mitm/`, but no active entrypoint references it. The new gateway does not intercept browser login/session traffic or extract tokens. |
| Local authorized debugging proxy | **Isolated opt-in only** | The legacy MITM server now refuses startup unless `ENABLE_LEGACY_MITM=true` and `LEGACY_MITM_ACK=I_UNDERSTAND_LOCAL_DEBUG_ONLY` are both set. It is not part of the active gateway and its certificate lifecycle remains outside the compliant production path. |
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
| Usage metrics | **Complete for persisted aggregates; UI parity partial** | The usage store now records input/output/total tokens, estimated cost, latency, success rate, and provider/model aggregates. A full interactive 9Router-style chart UI is still not complete. |
| Port fallback | **Complete** | Next and standalone gateway prefer localhost port `2018` and select the next free port. A real smoke test occupied `2018`, observed selection of `2019`, and received a successful `/health` response. |
| Loopback safety | **Complete within default boundary** | Default bind is `127.0.0.1`; non-loopback binding requires `GATEWAY_ALLOW_LAN=true`. Public deployment still needs operator hardening. |
| 0.1 CPU / 30 MB package / 100 MB RAM target | **Unverified** | Lightweight API-only mode exists, but no resource benchmark or concurrency/load test proves these exact limits. Node, Next, SQLite, and dependencies may exceed them. |
| No web scraping | **Verified by dependency/source scan for active gateway** | No Playwright/Puppeteer/Cheerio-style scraping dependency or active gateway scraping path was found. Legacy MITM and account code remain in the repository and require separate cleanup if the repository must be free of all legacy code. |
| Import should merge rather than erase old entries | **Complete for gateway metadata and API-key pools** | Runtime provider import is merge-only and credential import appends to the encrypted pool. Legacy password-account store/import is a separate path and currently fails tests. |
| Dashboard/UI enhancement | **Improved safe gateway surface** | Gateway and Models pages expose provider selection, Bedrock-compatible model IDs, metadata import, pricing/capability/routing fields, audit, refresh, expiry, and setup surfaces. Legacy account pages remain separate and are not a supported credential path. |

## Validation evidence

The focused gateway suite passed **18/18** tests. Those tests cover configuration gates, merge-only sanitization, model-refresh parsing, tool compatibility, vision fallback, response normalization, endpoint-audit leakage and mismatch detection, encrypted credential round-tripping, and port normalization/fallback. The audit integration test uses a local HTTP server, not a real external provider.

The production build passed with exit code `0`. Next reported a middleware-convention deprecation warning and an NFT tracing warning, but compilation succeeded.

A standalone runtime smoke test occupied `127.0.0.1:2018`; the gateway logged `Gateway listening at http://127.0.0.1:2019`, and `GET /health` returned `ok: true`. A separate local end-to-end test used a real generated gateway API key, a local authorized mock upstream, and the active standalone gateway. It received HTTP 200 for `/v1/models` and `/v1/chat/completions`, and returned the mock upstream completion text.

The compiled Next runtime served `/login` with HTTP 200 and redirected unauthenticated `/dashboard/gateway` requests to `/login?redirect=%2Fdashboard%2Fgateway`. Unauthenticated provider-management and refresh requests returned HTTP 401. The public status endpoint returned HTTP 200 with sanitized provider and capability status.

The full repository command previously ran **129 tests: 111 passed, 18 failed**; those failures remain isolated to the legacy account/tier-detection path and were not silently changed in this pass. The focused gateway suite now passes **18/18**, including Bedrock message conversion, SigV4 helper coverage, OAuth state expiry, metadata import, audit, and port fallback. The failures are not all the same issue. The account import/parser and account export/store groups fail because the legacy account path uses `DatabaseSync.transaction`, which is unavailable in the current Node runtime, and because the format/parser expectations conflict with the current implementation. Tier-detection caching and batch tests also fail because the legacy account store cannot persist/update the required records. These are genuine incomplete or broken legacy paths, not evidence that the gateway tests passed.

## Mock versus real behavior

The endpoint-audit mismatch test and the end-to-end gateway forwarding test are **real local integration tests**, but they are still mock-provider tests. No live OpenAI, Anthropic, Qwen, Kimi, Grok, ChatGPT, GitLab, Lovable, or OAuth provider was contacted. AWS Bedrock discovery and inference are implemented against the official API boundary but still require the operator’s authorized AWS credentials and regional model access for live validation. Therefore, provider-specific compatibility, rate-limit behavior, model catalog accuracy, OAuth redirect behavior, and hidden-backend attribution remain unverified.

The dashboard is not a static mock for the new gateway surfaces: it calls real API routes. However, the older Import Accounts page contains demonstration JSON and a Kiro-specific device-code workflow; it should not be interpreted as a universal provider/OAuth implementation.

## Bottom line

The active gateway is functional for explicit OpenAI/Anthropic-compatible providers, AWS Bedrock Converse/SigV4 routing and discovery, encrypted authorized API-key/OAuth-token pools, local port fallback, model metadata import, token/cost analytics, endpoint evidence auditing, and the enhanced safe dashboard. Kiro and Lovable remain documented authorized custom-endpoint profiles rather than undocumented private-client adapters; named provider live validation and full interactive graph UI remain credential/environment-dependent. Cookie/session conversion, third-party session MITM, free-tier bypass, and legacy account dumps are intentionally absent. The standalone smoke test measured approximately 59 MB for the test process, selected port 2019 when 2018 was occupied, and returned HTTP 200 for both `/health` and authenticated `/v1/models`; this is not a concurrency/load benchmark.


## Account-flow audit — 2026-08-12

The active `/api/accounts` route was inconsistent with the compliant gateway: it used the Kiro token store without enforcing a dashboard role and accepted generic proxy-shaped token objects. It is now admin-only, hides access and refresh tokens in list responses, accepts only explicit access/refresh OAuth tokens for add/import, and rejects password, cookie, session, session-token, and header fields.

A real duplicate-account defect was found. The store persisted the existing account ID but returned a newly generated temporary ID, which could make a successful update appear to fail or cause a later test/delete action to target the wrong record. The store now returns the persisted record and exposes a compatible `getById` lookup.

An isolated smoke test passed add, duplicate update, safe token import, rejection of unsafe records, lookup, and delete. The active gateway suite passed 20/20 and the production build passed. The broader legacy `tests/accounts.test.js` suite still targets the separate password-based SQLite account store and fails because that retired store is not the active compliant Kiro credential store. The old 9Router/OmniRouter/password import UI is stale; its HTTP import/export routes remain intentionally disabled with HTTP 410.

The compliant path can import explicitly authorized API/OAuth token material through provider management or the Kiro device-auth flow. It does not import browser cookies, session cookies, passwords, private client tokens, or account dumps, and it does not convert those materials into API credentials.
