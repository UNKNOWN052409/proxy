# Provider Adapter Research Notes

## Official sources collected 2026-08-12

| Provider | Official source | Findings relevant to adapter work |
|---|---|---|
| Qwen / Alibaba Model Studio | https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope | Model Studio provides an OpenAI-compatible interface for Qwen models. Adapter can use explicit base URL, API key, model, and chat-completions conventions. |
| Qwen API Platform | https://qwen.ai/apiplatform | Official Qwen API platform landing page for model access and chat-completions usage. |
| Moonshot Kimi | https://platform.kimi.ai/docs/overview | Official Kimi API platform overview; supports chat API, agent tasks, visual understanding, and reasoning. |
| Moonshot Kimi chat | https://platform.kimi.ai/docs/api/chat | Official chat endpoint documentation; supports standard chat, Partial Mode, and tool use/function calling. |
| xAI / Grok text | https://docs.x.ai/developers/model-capabilities/text/generate-text | Official xAI text generation documentation describing chat-completions and responses usage. |
| xAI / Grok chat completions | https://docs.x.ai/developers/model-capabilities/legacy/chat-completions | Official xAI chat-completions documentation. |
| xAI models | https://docs.x.ai/developers/models | Official xAI model catalog documentation. |

These are research leads from official documentation search results. Before implementation, each URL must be opened/extracted for exact endpoint paths, headers, model-list semantics, tool/vision support, and error formats. No live provider credentials were used.

## Verified by official page navigation

- **Qwen / DashScope:** the opened Alibaba page is the official “Call Qwen models via OpenAI API” documentation. It confirms an OpenAI-compatible integration path, but the page rendered minimally in the browser; exact model-list details need confirmation from the linked API reference before coding.
- **Kimi:** the official Kimi page confirms `POST /v1/chat/completions`, `GET /v1/models`, standard chat, multimodal content using `image_url` and `video_url`, tool use/function calling, streaming, and structured/partial modes. The Kimi page lists current model tabs such as `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5`, and `moonshot-v1`.
- **Kimi logo asset:** official page exposes a hosted light logo SVG at `https://mintcdn.com/moonshotai/X_5b_eA1iuJP595e/assets/logo/light.svg?fit=max&auto=format&n=X_5b_eA1iuJP595e&q=85&s=f68cf2d80f8d7f0363e088d2b988a598`.

## Additional official pages verified

| Provider | Verified finding |
|---|---|
| xAI / Grok | The official model page lists `grok-4.5` with agentic tool calling and configurable reasoning, and links to official text, streaming, function-calling, and model documentation. A dedicated OpenAI-compatible adapter can be built around documented xAI APIs and model IDs. |
| GitLab Duo | The official GitLab Duo Chat API states that GitLab.com access is for internal use only, while GitLab Self-Managed can enable the endpoint behind a feature flag. It exposes `POST /chat/completions`, but the request is GitLab-specific (`content`, resource/context fields) and is proxied to GitLab’s AI Gateway. This should be implemented as an explicitly self-managed/authorized adapter, not as a public GitLab.com connector. |

Sources: https://docs.x.ai/developers/models and https://docs.gitlab.com/api/chat/.

## Dashboard branding and adapter status

The dashboard now exposes a provider directory from the dedicated profile registry. Qwen, Anthropic, GitLab, and OpenCode use locally bundled Simple Icons assets where available. OpenAI, Kimi, Grok, Lovable, and Kiro use local provider marks because their requested Simple Icons slugs did not resolve from the CDN during asset collection; these marks are intentionally treated as UI identifiers rather than claims of official trademark artwork.

Dedicated active adapter boundaries are: OpenAI and Anthropic documented APIs; Qwen/DashScope, Kimi/Moonshot, and xAI/Grok through their official OpenAI-compatible APIs; GitLab only for an authorized self-managed GitLab instance using its documented chat-completions route; and OpenCode only for a user-owned local OpenAI-compatible service. Lovable and Kiro are represented as explicit custom-endpoint profiles and are not enabled through private-client or browser-session protocols. Contract tests cover profile metadata and the self-managed GitLab request formatter; real-provider calls remain credential-dependent and were not performed in the test environment.
