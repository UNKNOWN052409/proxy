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


## Manual model-catalog import

The **Dashboard → Models** page now includes an **Import gateway models** panel for configured providers. Paste one model ID per line, comma-separated IDs, or a JSON array containing strings or objects with an `id` field. The import is authenticated, bounded to 1,000 entries, deduplicated, and applied atomically.

The default mode merges imported IDs with the existing provider catalog. The optional **Replace existing catalog** mode replaces only that provider’s catalog. Model IDs may contain provider-supported punctuation such as `:`, `@`, `-`, `_`, and `.` but cannot contain whitespace or path separators. The import accepts model metadata identifiers only; it never accepts API keys, cookies, passwords, authorization headers, or OAuth secrets.

The imported catalog is persisted with a source label and timestamp and appears in `/v1/models` alongside the provider’s configured models. Invalid input rolls back without changing the previous catalog.
