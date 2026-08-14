# Vision Fallback Configuration

## Purpose

The gateway can let a **text-only primary model** accept an OpenAI-compatible inline image input by asking a separately configured, authorized vision-capable provider to produce a compact textual description first. The text-only upstream receives that description together with the user's original text. This is a fallback for accessibility and compatibility; it is **not** evidence that the primary model natively supports vision.

> The gateway never downloads remote image URLs for this feature. It accepts only bounded inline `data:` image URLs and uses the configured provider's documented server API.

## Preconditions

| Requirement | Reason |
| --- | --- |
| A primary provider with `supportsVision: false` | This is the provider that needs a textual image description. |
| A separate authorized provider with `supportsVision: true` | It performs the image description request through its supported adapter. |
| An encrypted credential or configured official credential for the vision provider | The gateway does not derive credentials from browser sessions, cookies, or headers. |
| A compatible vision adapter | Currently OpenAI-compatible/custom, Anthropic, and official Qwen vision adapters can describe an inline image. |
| Inline PNG, JPEG, WEBP, or GIF data URL | Remote URLs and arbitrary MIME types are rejected. |

## Provider Configuration

Add the ID of the authorized vision provider to the primary provider's `visionProvider` field. The two providers remain independently configured, enabled, audited, and subject to tenant/provider allowlists.

```json
[
  {
    "id": "text-model",
    "label": "Text-only OpenAI-compatible model",
    "type": "openai",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "GATEWAY_TEXT_MODEL_KEY",
    "models": ["text-model-v1"],
    "defaultModel": "text-model-v1",
    "supportsVision": false,
    "visionProvider": "vision-model",
    "enabled": true
  },
  {
    "id": "vision-model",
    "label": "Authorized vision model",
    "type": "openai",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "GATEWAY_VISION_MODEL_KEY",
    "models": ["vision-model-v1"],
    "defaultModel": "vision-model-v1",
    "supportsVision": true,
    "enabled": true
  }
]
```

Use the dashboard provider import/configuration flow or the documented runtime configuration mechanism. Do not include a credential value in a provider-export file; import credentials separately through the encrypted account-import workflow or provide the declared environment variable.

## Request Behavior

When a chat request targets `text-model/text-model-v1` and includes an inline image part, the gateway validates the image, limits the number of images, requests descriptions from `vision-model`, and forwards only the resulting text and original message text to the primary model. If there are no image parts, the primary model is called normally.

| Scenario | Result |
| --- | --- |
| Primary model has native vision support | The request remains with the primary model; no fallback description is requested. |
| Primary model is text-only and `visionProvider` is configured | Valid inline images are described through the vision provider, then sent as text context to the primary model. |
| Primary model is text-only and no `visionProvider` is configured | The gateway returns `unsupported_vision` with a configuration-safe error. |
| Vision provider is disabled, expired, blocked, uncredentialed, or not vision-capable | The request fails safely and does not call the text-only model with an invented description. |
| Image uses a remote URL | The gateway rejects it; no remote URL is fetched. |

## Operational and Privacy Boundaries

Descriptions are charged and counted against the configured vision provider, while the final chat request is attributed to the primary provider. Provider health and encrypted credential state continue to apply separately. The gateway records operational metadata and errors, not raw upstream authorization headers or account billing data.

The fallback is intentionally conservative. It does not claim model identity, bypass provider image policies, convert web sessions into API credentials, or fetch images from third-party URLs.

## Verification

Run the deterministic regression coverage after any configuration or adapter change:

```bash
node --test --test-concurrency=1 tests/vision.test.js tests/gateway.test.js
```

A live image-description check requires an administrator-owned, explicitly authorized vision credential. A successful request proves the configured route worked at that time; it does not prove universal vision support for every upstream model.
