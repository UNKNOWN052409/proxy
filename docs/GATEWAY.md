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
curl http://127.0.0.1:20127/v1/models \
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

For a native vision-capable provider, image content is forwarded without this text fallback.

## API contract

The API accepts the standard OpenAI-style chat request body. The gateway does not use provider account passwords; use a bearer gateway key instead.

```bash
curl http://127.0.0.1:20127/v1/chat/completions \
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
| `GATEWAY_PORT` | Standalone gateway port; default is `20127`. |
| `GATEWAY_HOST` | Standalone bind address; default is `127.0.0.1`. |
| `GATEWAY_MAX_BODY_BYTES` | Standalone JSON request limit; default is two MiB. |
| `GATEWAY_CORS_ORIGIN` | Optional browser origin override; default is `http://localhost:20127`. Set one specific trusted origin for shared deployments. |

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

The old Kiro account-import endpoint is disabled with HTTP 410. The legacy MITM server refuses startup unless both `ENABLE_LEGACY_MITM=true` and `LEGACY_MITM_ACK=I_UNDERSTAND_LOCAL_DEBUG_ONLY` are explicitly set for authorized local debugging. These legacy paths are not part of the compliant gateway.

## API forensics and black-box model identity audit

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
