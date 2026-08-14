# Compliant AI Gateway

This repository now includes an **OpenAI-compatible gateway** for API providers that you configure with credentials issued for your own account or organization. The public API is available through the Next.js application at `/v1`, or through the smaller standalone runtime with `npm run gateway`.

> The gateway does not intercept third-party traffic, import browser cookies, convert sessions into API credentials, rotate accounts, or execute arbitrary tool calls. It routes requests only to explicit provider integrations.

## Quick start

Create an API key from **Dashboard → Endpoint & Access**. It is shown once and stored only as a hash. Configure at least one upstream provider in the server environment, then start either the full application or the standalone gateway.

| Runtime | Command | Intended use |
|---|---|---|
| Full application | `npm run build && npm run start` | Dashboard, key management, analytics, and gateway API. |
| Standalone gateway | `npm run gateway` | A smaller API-only process with `/health`, `/v1/models`, and `/v1/chat/completions`. |

```bash
export GATEWAY_OPENAI_API_KEY='provider-issued-secret'
export GATEWAY_OPENAI_BASE_URL='https://api.openai.com/v1'
export GATEWAY_OPENAI_MODELS='gpt-4.1-mini'
export GATEWAY_OPENAI_DEFAULT_MODEL='gpt-4.1-mini'
export GATEWAY_OPENAI_SUPPORTS_TOOLS='true'
export GATEWAY_OPENAI_SUPPORTS_VISION='true'

npm run gateway
```

The provider secret stays server-side. Clients authenticate to the gateway with a separately created gateway key:

```bash
curl http://127.0.0.1:2018/v1/models \
  -H 'Authorization: Bearer <gateway-key>'
```

## Multiple providers

Set `GATEWAY_PROVIDERS_JSON` to an array. Each provider has an `id`, `type` (`openai` or `anthropic`), HTTPS `baseUrl`, an environment-variable name for its key, models, and capability flags. HTTP is allowed only for loopback development endpoints.

```json
[
  {
    "id": "primary",
    "label": "Primary API",
    "type": "openai",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "GATEWAY_PRIMARY_API_KEY",
    "models": ["chat-model", "vision-model"],
    "defaultModel": "chat-model",
    "supportsTools": true,
    "supportsVision": true
  },
  {
    "id": "text-only",
    "label": "Text API",
    "type": "anthropic",
    "baseUrl": "https://api.example.net/v1",
    "apiKeyEnv": "GATEWAY_TEXT_API_KEY",
    "models": ["text-model"],
    "defaultModel": "text-model",
    "supportsTools": false,
    "supportsVision": false,
    "visionProvider": "primary"
  }
]
```

Call enabled models using `provider-id/model-id`, such as `text-only/text-model`. The `/v1/models` endpoint lists the enabled names.

## Tool compatibility layer

For an upstream marked `supportsTools: false`, the gateway adds a constrained protocol instruction and asks the upstream model to return a compact tool-call decision. The gateway verifies that each requested tool appears in the client-provided tool list, validates argument JSON, and returns standard OpenAI-style `tool_calls` to the client.

The connected client remains responsible for executing tools and supplying tool results in a later request. This keeps tool permissions in the application that owns them and prevents the gateway from running arbitrary code or making unrestricted network calls.

## Vision fallback for text-only models

If a selected model is text-only and its provider defines `visionProvider`, the gateway sends a bounded **inline** image to the configured vision-capable provider. The generated description replaces the image before the request goes to the text-only model.

| Control | Behavior |
|---|---|
| Accepted image source | Inline `data:` URL using PNG, JPEG, WebP, or GIF. |
| Image limit | Four images per request; five MiB per image. |
| Remote URLs | Rejected; the gateway does not fetch external image URLs. |
| Image instructions | The vision prompt explicitly treats any instructions embedded in an image as untrusted content. |

For a native vision-capable provider, image content is forwarded without this text fallback. See [vision-fallback.md](./vision-fallback.md) for the complete configuration and operational boundary.

## API contract

The API accepts the standard OpenAI-style chat request body. The gateway does not use provider account passwords; use a bearer gateway key instead.

```bash
curl http://127.0.0.1:2018/v1/chat/completions \
  -H 'Authorization: Bearer <gateway-key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "primary/chat-model",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

The full application provides normalized response streaming by returning a completed response as an SSE sequence. The standalone process intentionally accepts non-streaming requests only to keep its implementation minimal and deterministic.

## Environment reference

| Variable | Purpose |
|---|---|
| `GATEWAY_PROVIDERS_JSON` | JSON array used for multi-provider configuration. Takes precedence over shortcut variables. |
| `GATEWAY_OPENAI_API_KEY` | Shortcut provider key for an OpenAI-compatible API. |
| `GATEWAY_OPENAI_BASE_URL` | Optional shortcut provider base URL; default is OpenAI’s API base path. |
| `GATEWAY_OPENAI_MODELS` | Comma-separated enabled models for the shortcut provider. |
| `GATEWAY_OPENAI_SUPPORTS_TOOLS` | Set to `false` to enable client-managed tool compatibility. |
| `GATEWAY_OPENAI_SUPPORTS_VISION` | Set to `true` only when the configured models accept image content. |
| `GATEWAY_ANTHROPIC_API_KEY` | Shortcut provider key for an Anthropic-compatible API. |
| `GATEWAY_PORT` | Standalone gateway port; default is `2018`. |
| `GATEWAY_HOST` | Standalone bind address; default is `127.0.0.1`. |
| `GATEWAY_MAX_BODY_BYTES` | Standalone JSON request limit; default is two MiB. |
| `GATEWAY_CORS_ORIGIN` | Optional browser origin override; default is `http://localhost:2018`. Set one specific trusted origin for shared deployments. |

## Verification

Run the focused gateway suite after changing gateway modules:

```bash
node --test tests/gateway.test.js
npm run build
```

The existing legacy account-import and tier-detection tests are separate from the new gateway modules. They are not required by the compliant provider-adapter path and must not be used to add cookie/session conversion or account-pooling behavior.

## Provider management dashboard

The **Dashboard → Gateway** view adds provider-level health checks, model refresh, enable/disable controls, and expiry notices. It never displays provider key values. A provider is considered unavailable to routing when it is disabled or when its configured `expiresAt` timestamp has passed.

Use **Add provider** to merge JSON configuration by provider `id`. The import accepts provider metadata only; it rejects credential fields, cookies, `Authorization` headers, and `X-API-Key` headers. Set the referenced API-key environment variable on the server before testing the provider.

```json
[
  {
    "id": "custom-api",
    "label": "My OpenAI-compatible API",
    "type": "openai",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "GATEWAY_CUSTOM_API_KEY",
    "models": ["chat-model"],
    "defaultModel": "chat-model",
    "supportsTools": false,
    "supportsVision": false,
    "enabled": true,
    "expiresAt": "2030-01-01T00:00:00Z"
  }
]
```

> Imports are additive and merge matching provider IDs. They are not a credential-import mechanism. Use a deployment secret manager or the host environment for all provider-issued secrets.

## Model catalog refresh and provider health

The dashboard’s **Test & refresh** action runs a bounded documented model-list request for one provider. It stores a maximum of 1,000 returned model IDs, records response latency, and reports one of these non-sensitive health states: `healthy`, `authentication_error`, `rate_limited`, `unavailable`, `timeout`, or `missing_configuration`.

| Scheduling approach | How it works | Operational characteristic |
|---|---|---|
| Server cron or platform scheduler | Run `npm run gateway:refresh-models` once per day. | Lowest overhead; no resident background process. |
| Dashboard-triggered refresh | Use **Refresh all models** after changing access or permissions. | Immediate validation; intended for administrative use. |

For a Linux host using cron, the daily command can be scheduled as follows. Ensure the execution environment includes the same provider-key variables as the gateway process.

```cron
15 3 * * * cd /path/to/proxy && /usr/bin/npm run gateway:refresh-models >> /var/log/proxy-model-refresh.log 2>&1
```

The provider model-list API contracts used by this feature are documented in [`provider-model-list-sources.md`](./provider-model-list-sources.md). OpenAI exposes `GET /models` with bearer authorization, while Anthropic exposes `GET /v1/models` with an API key and version header. [1] [2]

## Analytics additions

Gateway usage entries now preserve duration, result status, provider, model, and token counts. The main dashboard shows average latency, request success rate, and a provider reliability panel in addition to the existing request and token history. Error details are truncated before persistence.

## References

[1] OpenAI, [List models](https://developers.openai.com/api/reference/resources/models/methods/list/).

[2] Anthropic, [List Models](https://platform.claude.com/docs/en/api/models/list).

## Dedicated provider directory

The Gateway dashboard exposes dedicated profiles for OpenAI/ChatGPT, Anthropic, Qwen/DashScope, Moonshot Kimi, xAI/Grok, self-managed GitLab Duo, Lovable custom endpoints, Kiro custom endpoints, and local OpenCode-compatible services. Qwen, Kimi, and Grok use their documented OpenAI-compatible API boundaries. GitLab is restricted to explicitly authorized self-managed instances. OpenCode can be local and no-auth upstream, but the public gateway remains authenticated. Lovable and Kiro are metadata/custom-endpoint profiles unless the user supplies an authorized documented endpoint.

Provider cards use locally bundled SVG assets. Where a Simple Icons source was unavailable, the project uses a local branded provider mark as a UI identifier and does not claim it is official trademark artwork. Provider credentials remain server-side and are never placed in the logo directory or returned by status APIs.

## AWS Bedrock and official OAuth additions

AWS Bedrock is now a first-class provider using the official Converse API and native AWS Signature Version 4 signing. Set `AWS_REGION` or `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`; `AWS_SESSION_TOKEN` is supported for temporary credentials. The provider can discover foundation models through the official Bedrock control-plane API and route OpenAI-compatible chat requests through Bedrock Runtime. No browser cookies, Kiro sessions, or private client tokens are read.

Provider configuration may define official OAuth metadata (`oauthAuthUrl`, `oauthTokenUrl`, `oauthClientIdEnv`, `oauthClientSecretEnv`, `oauthScopes`, and `oauthRedirectUri`). Authenticated dashboard routes create short-lived state, exchange an authorization code, and place only the returned access token into the encrypted credential pool. OAuth is enabled only when the operator supplies documented provider endpoints and client environment variables.

Model imports preserve bounded metadata: `alias`, `name`, `description`, `upstreamModelId`, `contextWindow`, `supportsTools`, `supportsVision`, `enabled`, `inputCostPerMillion`, `outputCostPerMillion`, and `routingPriority`. This metadata is returned by `/v1/models` under `metadata`, `pricing`, `routing`, and `capabilities` without accepting headers, cookies, passwords, or embedded secrets.

Usage analytics record input tokens, output tokens, total tokens, latency, success rate, and estimated provider cost when pricing metadata is configured. Cost remains an estimate unless the upstream provider exposes authoritative billing data.

The old Kiro account-import endpoint is disabled with HTTP 410. The retired local debug component refuses startup unless `ENABLE_LEGACY_MITM=true`, `LEGACY_MITM_ACK=I_UNDERSTAND_LOCAL_DEBUG_ONLY`, and a loopback-only `MITM_LOCAL_TARGETS` allowlist are explicitly set for traffic the administrator owns and controls. Third-party provider domains are filtered out. These legacy paths are not part of the compliant gateway.

## API Authenticity Verification and API Legitimacy Validation

The gateway includes a separate legitimacy validator at `scripts/api-legitimacy.js`. It answers a narrower question than hidden-model attribution: **does this endpoint present a coherent, authenticated, standards-like API contract over a valid transport?**

Run it with `LEGITIMACY_BASE_URL`, `LEGITIMACY_API_KEY`, and optionally `LEGITIMACY_MODEL`. It performs bounded checks for DNS resolution, certificate validity metadata, TLS protocol/cipher, unauthenticated and invalid-credential behavior, authenticated model-list behavior, provider-owned model claims, and selected intermediary headers. It never probes private admin routes, scans ports, bypasses authentication, stores response bodies, or extracts cookies/tokens.

| Evidence level | Examples | What it supports |
|---|---|---|
| Strong | Valid hostname certificate, TLS handshake, `401/403` without credentials, authenticated standards-compatible response. | Transport and API-boundary legitimacy. |
| Medium | Requested model appears in the authenticated catalog, response model is stable, official error shape is consistent. | Contract conformance and routing consistency. |
| Informational | Nginx/Cloudflare/Vercel/Via headers, DNS address, certificate issuer. | Observable infrastructure only; not provider ownership proof. |
| Missing | No authenticated response, timeout, CDN `522/502`, fabricated or missing model catalog. | Legitimacy remains partially supported or unverified. |

The validator’s verdict is **not** a legal ownership certificate and does not prove that a provider is an official reseller. A real certificate proves control of a hostname, not control of the model behind it. Definitive provider legitimacy requires a trusted official domain relationship, provider documentation, signed attestation, or control-plane/billing evidence.


The gateway now includes a bounded **API-forensics** layer for authorized endpoints. It combines the identity/behavior probes below with passive transport evidence. It does not scan ports, exploit a provider, bypass authentication, extract credentials, inspect cookies, or attempt to compromise a third-party service.

| Forensic class | Evidence collected | Safe interpretation |
|---|---|---|
| Transport and CDN | Final host, HTTPS scheme, redirects, selected `Server`, `Via`, CDN/request markers, and cache signals. | Indicates observable intermediaries such as Cloudflare, Vercel, Fly, Nginx, or Envoy; it does not reveal private topology. |
| Error signatures | HTTP status, structured error type/code, and bounded CDN/generic error classification. | Helps identify adapter or intermediary behavior without storing the error body. |
| Response consistency | Model IDs across catalog and completion responses, status sequence, and response shapes. | Detects contradictions and model-switching signals. |
| Latency pattern | Per-request latency for model discovery and bounded probes. | Shows network/provider behavior; local gateway overhead is reported separately. |
| Capability behavior | Sentinel, self-report, tool, and leakage checks. | Shows observable behavior only, not model-weight identity. |

The repeatable CLI harness is `scripts/api-forensics.js`. Run it with `FORENSICS_BASE_URL`, `FORENSICS_API_KEY`, `FORENSICS_MODEL`, and optionally `FORENSICS_PROBES=1..3`. It prints only redacted evidence metadata and never prints the API key or response body.


The **Dashboard → Gateway → Endpoint audit** action can test an explicitly configured API endpoint and selected model. The audit sends bounded, non-invasive probes and stores metadata only. It never stores the returned answer, hidden prompts, cookies, or authorization values.

| Evidence | What it checks | Interpretation |
|---|---|---|
| Model-list evidence | Whether the advertised model appears in the endpoint’s documented model catalog. | A missing model is an inconsistency signal, not proof of a hidden replacement. |
| Response identity | The `model` field in the response and safe routing headers such as `x-upstream-model`. | A response saying `deepseek-chat` while the request says `claude-opus` is a strong mismatch signal. |
| Sentinel probe | Whether the endpoint returns the exact audit token. | Detects response transformation or unexpected instruction behavior; it does not fingerprint model weights. |
| Self-report probe | Requests a small JSON family/version self-report. | Stored as unverified self-report because any model or proxy can fabricate it. |
| Tool probe | Supplies a harmless audit-only function and checks for a standard tool call. | Shows observable tool-call compatibility; it does not prove model family. |
| Leakage scan | Checks bounded output for system/developer prompt or credential-like material. | Reports indicators without extracting or persisting secrets. |
| Latency split | Separates model-list/probe upstream timing from local audit overhead. | The `<1 ms` value is a target for local overhead, not a guarantee for network or model latency. |

Run one to three probes from the dashboard. A report such as **inconsistent / reported deepseek-chat / advertised claude-opus** means the endpoint’s observable contract does not match the requested identity. A report such as **provisionally consistent** means only that the observed metadata and probes did not contradict the claim.

> A remote black-box API cannot be forced to reveal its actual hidden backend model. The audit can detect contradictions, proxy fingerprints, response transformations, capability mismatches, and prompt leakage indicators, but it cannot mathematically prove that an endpoint is GPT-3.5, GPT-5, Opus, or any other model when the upstream deliberately hides or falsifies identity. Definitive attribution requires provider-side logs, signed attestations, or an authorized upstream control plane.


## Manual model-catalog import

The **Dashboard → Models** page now includes an **Import gateway models** panel for configured providers. Paste one model ID per line, comma-separated IDs, or a JSON array containing strings or objects with an `id` field. The import is authenticated, bounded to 1,000 entries, deduplicated, and applied atomically.

The default mode merges imported IDs with the existing provider catalog. The optional **Replace existing catalog** mode replaces only that provider’s catalog. Model IDs may contain provider-supported punctuation such as `:`, `@`, `-`, `_`, and `.` but cannot contain whitespace or path separators. The import accepts model metadata identifiers only; it never accepts API keys, cookies, passwords, authorization headers, or OAuth secrets.

The imported catalog is persisted with a source label and timestamp and appears in `/v1/models` alongside the provider’s configured models. Invalid input rolls back without changing the previous catalog.

## Safe custom endpoint onboarding

The Models dashboard includes an authenticated **Custom authorized endpoint** flow. Enter an HTTPS or loopback URL and, when authorized, an API key. The detector checks only documented contracts: OpenAPI or Swagger descriptions, standard model catalogs, response content type, authentication status, and redacted provider markers. It does not inspect browser traffic, discover hidden website routes, intercept third-party requests, import cookies, or convert session tokens.

Run **Auto-detect contract** first. If the result is usable, **Save provider** stores the endpoint as a `custom` provider, routes it through the existing OpenAI-compatible adapter, and stores the supplied API key only in the encrypted credential pool. If detection is inconclusive, the operator can still provide an explicit documented request/response contract and save a manual OpenAI-compatible custom provider. The detector never claims that an undocumented `/v0` or web form endpoint is an API merely because a browser observed it.

The custom provider is exposed through the gateway's normal `/v1/models` and `/v1/chat/completions` routes, subject to gateway API-key scopes, provider health, and configured model allowlists. The implementation intentionally excludes third-party MITM interception, cookie/session-to-API conversion, password scraping, hidden endpoint discovery, and arbitrary browser automation.

## Qwen / Alibaba ModelStudio

Qwen is integrated through the official OpenAI-compatible Alibaba ModelStudio API boundary. The adapter supports standard API keys and Coding Plan API keys, native tools when the selected model supports them, inline vision for vision-capable Qwen models, bounded model-catalog refresh, usage accounting, and the existing client-managed tool fallback.

```bash
# Standard API key, international region
export DASHSCOPE_API_KEY='provider-issued-secret'
export GATEWAY_QWEN_REGION='intl'
export GATEWAY_QWEN_PLAN='standard'
export GATEWAY_QWEN_MODELS='qwen3.7-plus,qwen3.5-plus,qwen3-vl-plus'
export GATEWAY_QWEN_DEFAULT_MODEL='qwen3.7-plus'

# Or Coding Plan API key
export DASHSCOPE_API_KEY='sk-sp-provider-issued-secret'
export GATEWAY_QWEN_REGION='intl'
export GATEWAY_QWEN_PLAN='coding-plan'
export GATEWAY_QWEN_MODELS='qwen3-coder-plus,qwen3.5-plus'
export GATEWAY_QWEN_DEFAULT_MODEL='qwen3-coder-plus'

npm run gateway:refresh-models
```

The standard endpoint defaults are `https://dashscope.aliyuncs.com/compatible-mode/v1` for Beijing and `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` for the international region. Coding Plan defaults are `https://coding.dashscope.aliyuncs.com/v1` for Beijing and `https://coding-intl.dashscope.aliyuncs.com/v1` for the international region. Set `GATEWAY_QWEN_BASE_URL` explicitly when the provider documents a different authorized endpoint.

The former Qwen OAuth free tier was discontinued by Qwen on 2026-04-15. The gateway therefore does not offer Qwen browser login, cookie/session storage, browser token extraction, password-based account import, or Qwen Gate-style account rotation. Configure an official API key or Coding Plan key instead. See [`qwen-auth-research.md`](./qwen-auth-research.md) for the source-backed boundary.

The Qwen adapter accepts documented ModelStudio options through `extra_body`, including `enable_thinking`, `thinking_budget`, `incremental_output`, and `result_format`; it does not alter system prompts, claim hidden model identity, or infer a backend model beyond observable API evidence.


## Safe provider fallback routing

The gateway supports an explicit `fallbackProviders` list per provider. This is a bounded server-to-server failover mechanism inspired by routing patterns reviewed in [Portkey Gateway](https://github.com/Portkey-AI/gateway) and [OpenProvider](https://github.com/OpenProviderAi/OpenProvider). It tries configured fallback providers only after retryable upstream conditions such as timeouts, rate limits, or 5xx responses. Disabled, expired, unavailable, or uncredentialed providers are skipped; model allowlists and encrypted credential cooldowns remain enforced.

Example:

```json
[
  {
    "id": "qwen",
    "type": "openai",
    "adapter": "qwen",
    "baseUrl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "apiKeyEnv": "DASHSCOPE_API_KEY",
    "models": ["qwen3.7-plus"],
    "defaultModel": "qwen3.7-plus",
    "fallbackProviders": ["openai", "anthropic"]
  }
]
```

Fallback routing is not account pooling, free-tier bypass, cookie reuse, session scraping, or MITM interception. The gateway never imports browser sessions or private client tokens from reviewed repositories.

The comparative repository survey is recorded in `docs/github-gateway-research.md`. Direct code reuse was intentionally limited because LiteLLM has a non-standard license, OpenProvider is a separate full application, and Portkey is substantially larger than the lightweight runtime target. The current implementation adopts only small, auditable routing concepts with attribution.


## QwenGate compatibility review

The exact repository reviewed for the QwenGate comparison is [youssefvdel/qwengate](https://github.com/youssefvdel/qwengate), an MIT-licensed TypeScript/Bun project. Its OpenAI-compatible API shape, streaming conventions, bounded tool-call conversion, content-artifact filtering, model-health concepts, and dashboard observability were reviewed as design references.

The current gateway does **not** import QwenGate’s browser-authentication path. QwenGate’s documented architecture uses `chat.qwen.ai` browser automation, email/password account entry, browser-derived session material, session pooling, and multi-account rotation. Those features are outside this project’s Safe Boundary and are not converted into an adapter or compatibility mode. The current Qwen integration remains based on official ModelStudio/DashScope API keys and documented server-to-server endpoints.

Detailed findings and source links are in [`qwengate-research.md`](./qwengate-research.md).

## Xiaomi MiMo authentication

The gateway supports Xiaomi MiMo through the official OpenAI-compatible API using a provider-issued API key. Configure `MIMO_API_KEY` for pay-as-you-go API access, or configure the Token Plan base URL and `tp-...` credential supplied by the MiMo console. The adapter sends MiMo’s documented `api-key` header rather than importing local MiMo Code or Hermes credential files.

```bash
export MIMO_API_KEY='provider-issued-key'
export GATEWAY_MIMO_PLAN='standard'
export GATEWAY_MIMO_MODELS='mimo-v2.5-pro,mimo-v2.5'
export GATEWAY_MIMO_DEFAULT_MODEL='mimo-v2.5-pro'
```

For a Token Plan credential, use the dedicated base URL displayed by the MiMo console, for example:

```bash
export MIMO_API_KEY='tp-provider-issued-key'
export GATEWAY_MIMO_PLAN='token-plan'
export GATEWAY_MIMO_BASE_URL='https://token-plan-sgp.xiaomimimo.com/v1'
```

MiMo Code, Hermes, and similar tools may offer a login flow that ultimately creates or stores a provider credential. The gateway does not import their local OAuth/session state. If a provider login is officially supported, complete it in the provider’s own console and provide the resulting API key through the encrypted gateway credential store. Browser cookies, session tokens, private client headers, and undocumented web-login traffic are not accepted as gateway credentials.


## Manus Open App OAuth

The gateway supports the official Manus Open App Authorization Code flow with PKCE. This is an OAuth-only integration for documented Manus API actions, not an OpenAI-compatible model provider. It is not included in `/v1/models` or chat routing.

Configure a Manus Open App client from the official Manus developer console:

```bash
export MANUS_OAUTH_CLIENT_ID='your-open-app-client-id'
export MANUS_OAUTH_CLIENT_SECRET='your-open-app-client-secret' # only if your registered client requires it
export MANUS_OAUTH_REDIRECT_URI='https://your-domain.example/api/gateway/oauth/manus/callback'
export MANUS_OAUTH_SCOPES='create_task'
```

Start authorization through the authenticated dashboard OAuth action for the `manus` provider. The gateway generates a state value and S256 PKCE challenge, validates callback state, exchanges the authorization code at `https://api.manus.ai/oauth/token`, and stores the returned access token plus refresh token encrypted with `GATEWAY_CREDENTIAL_MASTER_KEY`. Token values are never returned in dashboard metadata. Manus Open Apps are team-scoped and require the scopes configured by the registered application.

Manus connector cookies, browser sessions, or local web-app authentication state are not imported. MiMo CLI, Hermes, Qwen CLI, and other local tool credential files are also not imported; use provider-issued API keys or each provider's documented OAuth client configuration instead.

## Model authenticity and anti-spoofing audit

The authenticated audit route supports bounded black-box evidence checks for an authorized provider endpoint. It records aggregate TTFT, upstream latency, advertised-versus-reported model evidence, deterministic canary outcomes, prompt-leak indicators, transport markers, and optional graduated context probes. Raw prompts and raw responses are not retained in the audit record.

Use the dashboard's **Run audit** action to select a canary budget and an optional 8k, 32k, or 64k context probe. Larger context tests are deliberately opt-in because they consume provider quota and may trigger plan limits. A failed canary, prompt/system leakage indicator, inconsistent model marker, or implausibly fast TTFT for a premium-model claim can mark a provider as **quarantined** so normal routing stops using it until a subsequent authorized audit clears the condition.

TTFT is an anomaly signal, not a mathematical proof of model identity. Network location, caching, batching, prompt length, streaming implementation, and provider routing can affect latency. Context-window probes similarly show observed acceptance, truncation, or error behavior; they do not prove the hidden backend. Operators should treat the resulting score as evidence for routing and review, not as a cryptographic model attestation.

The audit layer is intended for user-owned or explicitly authorized endpoints. It does not capture browser sessions, cookies, passwords, private client headers, or undocumented third-party login traffic.


## Custom endpoint onboarding and prompt templates

Custom endpoint onboarding is **metadata-first**. A normal documented HTTPS endpoint may be checked for OpenAPI and model-catalog evidence, while a URL template such as `http://host:port/path?text=PROMPT_HERE` is recognized without sending traffic. The detector returns `requiresLiveTest: true` and waits for an explicit operator action.

The dashboard provides **Run one live request**, which substitutes the bounded test prompt for `PROMPT_HERE`, `{prompt}`, or `{{prompt}}`, sends one request, and displays only redacted status, latency, response shape, and a short sanitized preview. It does not schedule background traffic, run periodic probes, or claim that a response proves the hidden model identity. Unknown contracts must be configured manually with an explicit request/response mapping.

HTTPS remains the default. HTTP custom endpoints require an explicit per-test/per-provider opt-in and should be limited to an operator-owned or explicitly authorized endpoint. Browser interception, cookie/session import, credential extraction, arbitrary redirects, and hidden endpoint discovery remain disabled.

## OpenCode configuration import

The model dashboard supports **Preview import** and **Import providers + models** for a safe OpenCode configuration export. The importer accepts provider metadata, OpenAI/Anthropic compatibility, HTTPS base URLs, optional prefixes, display names, and model IDs. It deliberately rejects API keys, OAuth tokens, refresh tokens, cookies, passwords, authorization fields, and local session/auth files. Credentials must be entered through the encrypted server-side credential path.

Preview is metadata-only and sends no upstream request. Importing provider metadata also sends no upstream request; live health/model checks occur only through explicit operator actions. HTTP is rejected for remote OpenCode imports; HTTPS is required unless an endpoint is loopback or separately configured as an explicitly authorized custom test.

## VPS egress and client-IP privacy

For a deployed gateway, provider calls are made by the gateway process, so the upstream provider sees the deployment/VPS network egress address at the IP layer—not the end user’s laptop or phone address. The gateway does not copy `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, Cloudflare client-IP headers, or similar client-address headers into outbound provider requests. Tunnel or reverse-proxy access logs may still contain client IPs for local operational logging; they are not sent to model providers by the gateway. Actual egress identity depends on the hosting provider’s NAT, IPv4/IPv6 routing, proxy, or tunnel configuration and should be verified from the deployed environment.

This is a network-path property, not an identity guarantee: a provider can still receive normal TLS, request, account, and region metadata. Do not claim that traffic is physically located in a particular data center unless the VPS provider and route have been independently verified.

## Import status boundary

Provider-issued API-key imports, official OAuth flows, model catalog imports, manual model entries, custom OpenAI/Anthropic endpoints, and safe OpenCode metadata imports are supported. Browser login state, cookies, passwords, local CLI session files, and private client tokens are not import formats. A provider must expose a documented or explicitly authorized API contract before it can be routed as a gateway provider.

## Encrypted bulk credential import and verification

The dashboard and authenticated provider-management API support importing up to 20 user-owned API keys or official OAuth access tokens per provider. The secret is encrypted with AES-256-GCM under `GATEWAY_CREDENTIAL_MASTER_KEY`; list and status endpoints return only IDs, labels, lifecycle metadata, cooldown state, and verification summaries. Passwords, browser cookies, session cookies, private client tokens, and account dumps are rejected.

Use `POST /api/gateway/providers` with the following shape from an authenticated dashboard session:

```json
{
  "action": "import_credentials",
  "providerId": "primary",
  "credentials": [
    {"label": "primary", "apiKey": "provider-issued-key"},
    {"label": "backup", "token": "official-oauth-access-token", "expiresAt": "2030-01-01T00:00:00Z"}
  ],
  "verify": true,
  "probeCount": 2,
  "contextSizes": [8000]
}
```

When `verify` is enabled, each imported credential is checked sequentially against the provider’s documented model-list and completion boundary. The result records model-list status, probe status, TTFT, canary/context failures, leakage indicators, identity consistency, authenticity score, and a bounded error summary. A quarantined result is evidence of anomalous behavior and is not proof of hidden model identity. Existing credentials can be rechecked with `verify_credential` or `verify_credentials`. Verification never returns the credential value.

## OpenCode no-auth boundary

OpenCode-style no-auth upstreams are supported only for explicitly trusted local or private-network endpoints. The normalized OpenCode importer accepts metadata and models but rejects secret-bearing fields. For no-auth operation, enable the dedicated local OpenCode profile and keep the public gateway’s own Bearer/API-key authentication enabled. Public HTTPS endpoints must not be treated as no-auth merely because an OpenCode configuration omits a key. HTTP is permitted only for loopback or an explicitly controlled local test path.

This means a trusted service at `http://127.0.0.1:<port>` can be called without an upstream secret, while a remote client still needs a gateway key. The gateway does not inspect browser sessions, capture DevTools network traffic, intercept third-party login flows, or transform cookies into API credentials.

## VPS egress verification

All upstream `fetch` calls are executed by the gateway process. If the gateway is hosted on a VPS and the provider configuration points to an external HTTPS API, the provider observes the VPS egress address, not the requesting phone or laptop address. This statement applies to ordinary direct routing; a reverse proxy, outbound proxy, transparent proxy, IPv6 path, or provider-specific network layer can change the observed address and must be tested separately.

Verify the deployment with a VPS-controlled diagnostic endpoint or provider request logger. Send one request from a phone and one from the VPS itself, compare the upstream-observed source address, and confirm that forwarded client-IP headers are not added. The custom endpoint boundary explicitly strips or rejects client-IP forwarding signals. Do not use third-party interception or packet capture to perform this check; use an endpoint you control or an authorized provider diagnostic.

A minimal operational checklist is:

| Check | Expected result |
|---|---|
| Client sends gateway request | Gateway access log contains the client request, but no client IP is forwarded upstream by default. |
| Gateway sends provider request | Provider sees the VPS’s public egress address. |
| IPv4/IPv6 policy | The VPS firewall and DNS policy intentionally select the expected address family. |
| Reverse/outbound proxy | Any configured proxy’s egress address is documented and tested separately. |
| Secret handling | Provider keys remain server-side and are absent from logs, dashboard status, and responses. |

The gateway cannot guarantee a particular public address without deployment-level control of DNS, routing, firewall, and proxy settings; it can guarantee that it does not intentionally forward the client identity through custom `X-Forwarded-For`, `Forwarded`, or similar client-IP headers.

## Verification limitations

Black-box canaries, TTFT profiling, context probes, model-list consistency, and transport markers are evidence-based controls. They can detect contradictions, prompt leakage, implausibly fast premium-model claims, and unhealthy credentials, but they cannot mathematically prove a hidden model’s weights or reveal a provider’s private backend topology.

[3] Node.js, [Fetch API](https://nodejs.org/api/globals.html#fetch).

[4] OpenAI, [API authentication](https://platform.openai.com/docs/api-reference/authentication).

[5] OpenCode, [Configuration documentation](https://opencode.ai/docs/config/).

### References added for this section

[3] Node.js, [Fetch API](https://nodejs.org/api/globals.html#fetch).

[4] OpenAI, [API authentication](https://platform.openai.com/docs/api-reference/authentication).

[5] OpenCode, [Configuration documentation](https://opencode.ai/docs/config/).

## Request reliability and external native-tool layer

The authenticated `/v1/chat/completions` boundary now adds a bounded reliability layer before provider dispatch. Requests are queued with high, normal, or low priority and a default maximum concurrency of 50, so bursts such as ten simultaneous requests are managed rather than dropped. The limit can be changed with `GATEWAY_MAX_CONCURRENCY`.

Upstream calls use a default five-second timeout (`GATEWAY_UPSTREAM_TIMEOUT_MS`) and one retry after a five-second delay for timeouts, transient network failures, HTTP 408/425/429, and 5xx responses. Clients that require deduplication should send an `Idempotency-Key`; the gateway caches the result reference for five minutes and forwards that key to OpenAI-compatible upstreams.

The external tool layer validates OpenAI function schemas, `tool_choice`, `tool_call_id` references, tool result content, declared-tool permissions, and `parallel_tool_calls`. Native provider responses are normalized to stable OpenAI tool-call IDs and JSON arguments. Providers without native tool support use the existing client-managed shim, which returns tool calls but never executes them. Streaming responses are emitted through the gateway SSE adapter; tool-call frames are normalized before emission, while actual tool execution remains the responsibility of the client or an explicitly authorized external tool runner.

The diagnostics endpoint exposes only queue counters, timeout/retry configuration, idempotency-entry count, and provider health metadata. It never exposes request bodies, API keys, cookies, session material, or tool arguments. A failed provider may still be routed to an explicitly configured fallback provider subject to the API key's provider/model permissions.


## Tunnel lifecycle and monitoring

The dashboard supports **Cloudflare Quick Tunnel** creation for temporary testing and an existing user-owned **named Cloudflare Tunnel** for persistent domain access. A Quick Tunnel URL is intentionally ephemeral; the gateway cannot make it permanent. For durable access, create and authenticate a named tunnel in the user's Cloudflare account, map the chosen hostname to the gateway service, and run the connector under a process supervisor.

The tunnel manager stores only redacted lifecycle metadata: provider, mode, URL, PID, status, local health, public health, last check time, restart count, and the last non-secret error. It never stores or displays Cloudflare tokens. Monitoring checks the local `/health` endpoint and, when available, the public `/health` endpoint every 15 seconds by default (`TUNNEL_MONITOR_INTERVAL_MS` can change this). A failed connector process is restarted up to three times within five minutes; after that, the status remains degraded/down and requires operator intervention rather than looping indefinitely.

The API is available at `GET /api/config/tunnel` and `POST /api/config/tunnel` with these actions:

| Action | Purpose |
|---|---|
| `start` with `{provider:"cloudflare", mode:"quick"}` | Start an ephemeral Quick Tunnel to the configured local gateway port. |
| `start` with `{provider:"cloudflare", mode:"named", name:"my-tunnel", hostname:"https://api.example.com"}` | Run an already-created, already-authenticated named tunnel. The API does not create Cloudflare account resources or accept tokens. |
| `status` | Return redacted local/public health and connector state. |
| `restart` | Restart the managed Cloudflare connector using its current mode and configuration. |
| `stop` | Stop the managed connector. |

For production, the dashboard must have a strong password, the public API must require gateway authentication, and the named tunnel should use an explicit hostname and least-privilege ingress rule. A monitor can detect and restart the connector or gateway process, but it cannot guarantee that an upstream provider, DNS service, VPS, or network remains available; external alerting and a service supervisor are still recommended.

Tailscale is not automatically enabled because it requires a user-owned tailnet and authentication state. It remains a suitable private-network alternative when access should be restricted to the user's own devices rather than a public domain.

## Dual tunnel modes and local CLI connection profiles

The dashboard distinguishes a **long-running Quick Tunnel relay** from a **persistent user-owned named tunnel**. Quick Tunnel mode can be monitored and restarted while the gateway process is alive, but its `trycloudflare.com` hostname remains temporary and is not a permanent domain. Permanent access requires a user-owned Cloudflare named tunnel, DNS hostname, and authenticated connector configuration. The gateway does not create Cloudflare account resources or collect login credentials automatically.

The Settings page also exposes safe connection profiles for Pi Mono, Prime, Claude-compatible, Codex-compatible, OpenCode local, Gemini-compatible, Qwen-compatible, Kimi-compatible, Grok-compatible, JCode-compatible, and generic custom OpenAI-compatible clients. These are protocol presets, not claims of official provider integration. Profile generation emits a redacted base URL, model, authorization-header template, tool/vision capability flags, and an environment-variable name. It never imports cookies, browser sessions, passwords, or undocumented OAuth material. OpenCode is restricted to loopback/private URLs unless the operator explicitly uses a documented trusted configuration.

The connection endpoint is `GET/POST /api/config/connect`. It generates local proxy settings so authorized CLI tools can point to the gateway's OpenAI-compatible `/v1` endpoint. Provider credentials remain server-side and must be configured through the encrypted credential workflow.


## CLI setup wizard

The Settings page now provides a **CLI setup wizard**, rather than only a generic connection JSON. Select a supported client, gateway URL, and model, then generate a provider-specific artifact that can be previewed, copied, or downloaded.

Supported profiles are Pi Mono, Prime, Claude Code CLI, Codex CLI, OpenCode, Gemini CLI, Qwen CLI, Kimi CLI, Grok CLI, JCode CLI, and Custom CLI. OpenCode emits an `opencode.json` provider configuration and is restricted to loopback/private URLs. Codex emits a TOML preview for `~/.codex/config.toml`. Claude Code emits an environment-file template using `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`. Other profiles emit documented OpenAI-compatible environment templates where the installed client supports custom endpoints.

The generated artifact contains the gateway URL and a `$GATEWAY_API_KEY` placeholder only. It never contains a real provider secret, browser cookie, session token, password, or undocumented OAuth state. The wizard does not claim that every third-party CLI supports arbitrary base URLs; the install note instructs the user to confirm the installed version's documented configuration behavior. Applying a file to a user's home directory is intentionally a user-side download/copy action, not a server-side write.


## No-key-first custom endpoint verification

Custom endpoint onboarding now follows a bounded discovery flow. The gateway first probes only documented model/spec paths without an API key. If a documented endpoint returns HTTP 401 or 403 and an authorized API key was supplied, that same path is retried with the key. Transport failures, 404 responses, HTML pages, and arbitrary undocumented routes do not trigger credential retry.

After a model catalog is discovered, the caller may request `verifyOne: true`. The gateway then sends at most one OpenAI-shaped completion request using the first discovered model. The response is reduced to redacted status, latency, response shape, and a short redacted preview. No cookies, browser sessions, private headers, hidden routes, or MITM traffic are used.

The supplied `vip.prexzyapis.com` endpoint was tested with this flow on 2026-08-13. The anonymous `/v1/models` request failed during TLS negotiation with `SSL_ERROR_SYSCALL`, not with HTTP 401/403. Consequently, no authenticated retry and no completion request were sent. This is recorded as an unavailable live endpoint, not as a successful model import.
