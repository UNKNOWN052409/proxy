# OAuth Provider Research

Research date: 2026-08-12.

## Qwen

Official Qwen Code documentation says the old Qwen OAuth free tier was discontinued on 2026-04-15 and is no longer a selectable `/auth` option. The supported paths are Alibaba ModelStudio Coding Plan, Token Plan, Standard API Key, third-party provider API keys, and custom documented endpoints. The Coding Plan uses dedicated documented endpoints: `https://coding.dashscope.aliyuncs.com/v1` for Beijing and `https://coding-intl.dashscope.aliyuncs.com/v1` for international accounts. Standard API-key access uses documented DashScope-compatible endpoints.

Decision: keep the existing official Qwen API-key/Coding Plan adapter. Do not revive the discontinued browser OAuth flow or import cached browser tokens.

## Xiaomi MiMo Code

Official Xiaomi MiMo documentation says MiMo Code supports pay-as-you-go MiMo API and Token Plan. `mimo auth login` opens an official Xiaomi authorization flow and, after authorization, the platform creates a provider-issued API key prefixed `mimo-code-cli-key`; users can manage it in the official API Keys console. The generic CLI docs also describe API-key login for providers from Models.dev and separate OAuth for MCP servers.

Decision: a compliant MiMo provider can use an operator-supplied MiMo API key or an official OAuth flow only if Xiaomi publishes a server-side authorization-code/device flow suitable for the gateway. The gateway must not import `~/.local/share/mimocode/auth.json` or browser tokens from a user's device. If implementing OAuth, store only provider-issued access/refresh tokens in the existing encrypted credential pool, scoped to a tenant and provider.

## Hermes Agent

Official Hermes provider documentation lists both API-key providers and several provider OAuth/device-code flows. Documented examples include Nous Portal OAuth, OpenAI Codex device-code OAuth, GitHub Copilot device-code/auth-token paths, Anthropic OAuth for eligible plans, xAI Grok OAuth, Google Vertex service-account/ADC, and Qwen OAuth as a legacy/possibly stale entry while current Qwen official documentation says Qwen OAuth was discontinued. Hermes also supports API-key paths for Alibaba DashScope, Xiaomi MiMo, Kimi, Grok, OpenAI, Anthropic, and others.

Decision: do not copy Hermes credential files or private CLI session stores. Reuse only public protocol contracts. For a gateway adapter, prefer provider-issued API keys or a documented official OAuth/device-code exchange. Implement token refresh, expiry, revocation, and typed re-auth errors in the encrypted credential pool. Do not use a Hermes OAuth entry as proof that the upstream provider still authorizes that flow; validate against the provider’s own current documentation.

## Sources

1. Qwen authentication: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/
2. Alibaba Cloud Qwen API call: https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen
3. MiMo Code official configuration: https://mimo.mi.com/docs/en-US/tokenplan/integration/mimo-code
4. MiMo CLI authentication commands: https://mimo.xiaomi.com/mimocode/cli-subcommands
5. Hermes provider integrations: https://hermes-agent.nousresearch.com/docs/integrations/providers
6. Qwen Code repository: https://github.com/QwenLM/qwen-code
7. MiMo Code repository: https://github.com/XiaomiMiMo/MiMo-Code
8. Hermes Agent repository: https://github.com/NousResearch/hermes-agent

## Repository inspection update

Inspection of the current Hermes repository shows its `qwen-oauth` setup flow tells the user to run the local Qwen CLI authentication command and then reuses the local Qwen login. Hermes documentation labels this as Qwen Portal OAuth and describes browser login with persisted refresh tokens. This does not establish a separate current official server-to-server OAuth contract for a multi-tenant gateway, especially because the current official Qwen Code documentation says the Qwen OAuth free tier was discontinued.

Hermes also has a first-class Xiaomi/MiMo API-key provider and Alibaba/DashScope API-key and Coding Plan providers. Those are suitable as documented API-key adapters; the Hermes credential store itself is not imported.

## Manus and Hermes inventory update

### Manus API

Official Manus API v2 supports API-key authentication with `x-manus-api-key` and OAuth2 bearer tokens for third-party apps acting on behalf of users. The official Open App flow is RFC 6749 Authorization Code plus RFC 7636 PKCE. Authorization starts at `https://manus.im/openapi/oauth`; token exchange and refresh use `https://api.manus.ai/oauth/token`. Open Apps are team-scoped, require a Team account, and use configured scopes such as `create_task`, `manage_all_tasks`, `create_project`, `use_connectors`, and `use_my_browsers`. Access tokens are documented as 24-hour tokens and refresh tokens as 30-day tokens. These facts come from the official authentication and Open App documentation: https://open.manus.ai/docs/v2/authentication and https://open.manus.ai/docs/v2/open-app.

Manus connector OAuth is completed by the user in the Manus web app; the gateway should not capture or import connector cookies. A gateway integration can use the resulting official Manus Open App token for documented Manus API calls, but should keep connector authorization inside Manus and enforce tenant/provider scopes.

### Hermes provider inventory

The official Hermes provider documentation lists multiple authentication categories: provider-issued API keys (including Xiaomi MiMo, Qwen Cloud/DashScope, Alibaba Coding Plan, Kimi, MiniMax, xAI, OpenRouter, and others); sanctioned device-code or OAuth flows for providers such as OpenAI Codex, GitHub Copilot, Anthropic, and Nous Portal; and browser PKCE paths such as Qwen OAuth, MiniMax OAuth, and xAI Grok OAuth. The gateway may implement a provider’s documented API-key or official OAuth contract when its own client registration/configuration is supplied. It does not import Hermes `~/.hermes` auth files, refresh tokens, cookies, or browser session state.

Source: https://hermes-agent.nousresearch.com/docs/integrations/providers.
