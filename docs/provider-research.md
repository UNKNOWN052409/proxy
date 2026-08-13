# Provider research notes

Date: 2026-08-13

Sources reviewed:

- https://github.com/diegosouzapw/OmniRoute
- https://ollama.com/blog/openai-compatibility
- https://lmstudio.ai/docs/developer/openai-compat

Findings:

- OmniRoute documents a zero-configuration local gateway and names OpenCode Free and Felo as keyless free candidates. Its README also lists other free-tier candidates such as Pollinations, Qoder, Kilo, SiliconFlow, Z.AI GLM-Flash, and Baidu.
- The project’s free-tier claims are catalog/terms claims, not authorization to capture web-app traffic or session material. The gateway therefore records remote candidates as catalog-only and requires an explicitly documented endpoint before activation.
- Ollama officially documents an OpenAI-compatible local endpoint at http://localhost:11434/v1; the API key is required by some clients but unused by Ollama.
- LM Studio officially documents OpenAI-compatible local endpoints at http://localhost:1234/v1 and supports /v1/models, /v1/responses, /v1/chat/completions, /v1/embeddings, and /v1/completions.
- No cookie scraping, browser-session extraction, undocumented endpoint capture, MITM, or automatic remote no-auth traffic was added.

## 9Router MiMo Free follow-up (2026-08-13)

Public repository: https://github.com/decolua/9router

The repository release notes state `Add MiMo Free no-auth provider (#1789)` in v0.4.80. The public source tests and baseline registry show that this provider uses the upstream URL `https://api.xiaomimimo.com/api/free-ai/openai/chat`, exposes `mimo-auto` through the `mimo-free` provider, and sends `X-Mimo-Source: mimocode-cli-free` plus session affinity. The executor calls a bootstrap endpoint to obtain a short-lived JWT, sends a machine fingerprint as the bootstrap client, then sends `Authorization: Bearer <JWT>` to the chat endpoint and re-bootstraps/retries on HTTP 403. The source tests also cover system-marker injection. This is not a credentialless direct API; it is a provider-specific bootstrap-token flow with fingerprinting, special headers, system-marker behavior, and retry logic. It should not be copied as generic no-auth support without explicit authorization from Xiaomi/MiMo and a compliant published contract.

Official MiMo API documentation: https://mimo.mi.com/docs/quick-start/first-api-call

The official docs state that users must log in with a Xiaomi account and obtain either a pay-as-you-go API key or a Token Plan API key; examples use `https://api.xiaomimimo.com/v1` or a token-plan base URL and an `sk-...` or `tp-...` key. Therefore the gateway keeps official MiMo API-key support and does not label the 9Router bootstrap relay as generic no-auth.

## OmniRoute free-provider and Qwen follow-up (2026-08-13)

Sources reviewed:

- https://github.com/diegosouzapw/OmniRoute
- https://github.com/diegosouzapw/OmniRoute/discussions/2186
- https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/reference/FREE_TIERS.md
- https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/reference/PROVIDER_REFERENCE.md
- https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/
- https://github.com/QwenLM/qwen-code/issues/3203

OmniRoute publishes a broad catalog but its “no-auth” category is heterogeneous. Publicly listed examples include OpenCode Free, Felo, Pollinations, AI Horde, DuckDuckGo AI Chat, and other provider-specific or local/CLI bridges. Its public discussion says Pollinations currently works with a placeholder field while Puter moved to a web-session-token requirement; the latter is not a compliant no-auth integration for this gateway. The provider reference also includes entries whose implementation uses local official CLIs, anonymous documented keys, or provider-specific executors rather than a universal unauthenticated OpenAI endpoint.

The gateway should therefore classify candidates into: local no-auth (Ollama, LM Studio, local OpenCode), documented public endpoint (only after endpoint contract and terms are verified), provider API key/free tier, OAuth, and catalog-only candidate. It must not copy web-cookie, localStorage-token, browser-session, fingerprint bootstrap, or hidden endpoint flows merely because OmniRoute exposes them.

Qwen’s current official authentication documentation says the prior Qwen OAuth free tier was discontinued on 2026-04-15. Current supported paths are Alibaba ModelStudio Coding Plan, Token Plan, Standard API Key, third-party API keys, or custom OpenAI/Anthropic/Gemini-compatible endpoints. The cited Qwen issue records a proposed transition from 1,000 requests/day to 100 requests/day before closing the OAuth free entry point; this historical figure must not be treated as a current per-account quota. Current Qwen limits depend on the selected Alibaba plan/model/region and should be obtained from account/API response headers or the active plan documentation, not guessed globally.

## Hermes Agent free-tier OAuth audit (2026-08-13)

Sources reviewed:

- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/adding-providers.md
- https://hermes-agent.nousresearch.com/docs/integrations/providers

Hermes officially documents several authentication paths: Nous Portal OAuth, OpenAI Codex ChatGPT device-code OAuth, GitHub Copilot OAuth device code, Anthropic OAuth for eligible Claude Max plus extra usage, xAI Grok OAuth for eligible SuperGrok/Premium+ accounts, Google Vertex service-account/ADC, and local providers such as Ollama/LM Studio. It also lists Qwen OAuth and MiniMax OAuth in its provider menu, but Qwen’s own current documentation says the Qwen OAuth free tier was discontinued on 2026-04-15; Hermes’ provider listing alone is not proof that new Qwen OAuth accounts still work.

Hermes documents API-key paths for Qwen/Alibaba, MiMo, Kilo, OpenCode Zen, OpenCode Go, Hugging Face, Gemini, DeepSeek, Kimi, GLM, NVIDIA and others. It separately documents local CLI or endpoint integrations. The Hermes provider-development guide says OAuth providers require a real auth-store/token-refresh implementation and that a simple OpenAI-compatible endpoint should remain a custom provider instead of being misclassified as OAuth.

Potentially eligible gateway additions are official device-code/authorization flows with provider consent: OpenAI Codex, GitHub Copilot, Nous Portal, and xAI Grok OAuth, subject to each provider’s client registration, scopes, terms, and quota. Qwen OAuth should remain marked discontinued unless an active official flow is independently verified. No browser cookie, localStorage-token, DevTools capture, hidden endpoint, or session scraping is considered an OAuth implementation.

## Grok availability in 9Router / OmniRoute / CLIProxy (2026-08-13)

Sources reviewed:

- https://github.com/decolua/9router/issues/1285
- https://github.com/diegosouzapw/OmniRoute/issues/2760
- https://github.com/diegosouzapw/OmniRoute/wiki/Provider-Reference
- https://help.router-for.me/configuration/provider/xai

9Router’s public issue #1285 describes first-class xAI/Grok OAuth with PKCE and a loopback callback on 127.0.0.1:56121, plus API-key routing, Responses/Chat/Anthropic/Gemini translators, image/video routes, and refresh/re-auth handling. The issue was closed as completed, but it explicitly references CLIProxyAPI as the implementation model; it is not evidence of a free/no-auth Grok entitlement.

OmniRoute issue #2760 describes xAI Grok OAuth for SuperGrok/X Premium+ and says the existing grok-web route is a web-cookie provider. The issue text proposes xai-oauth/grok-oauth but the maintainer response says it was accepted/cataloged for a future implementation, not proof that the OAuth implementation shipped in that issue. The OmniRoute wiki separately lists grok-web as a web-cookie provider, which is outside this gateway’s safe boundary.

CLIProxyAPI’s public documentation confirms an xAI OAuth login command, a local loopback callback on 127.0.0.1:56121, xAI Responses API routing, OpenAI-compatible chat/responses routes, image/video routes, and model aliases. This is subscription/entitlement-backed Grok Build access, not a free anonymous upstream. Provider-side 403s may still occur for accounts without the required SuperGrok/X Premium+ entitlement.

Safe implementation conclusion: add a clearly labeled `xai-oauth` subscription OAuth provider only if using an official/public OAuth contract and user consent; do not add `grok-web` cookie import, web-session scraping, or claim no-auth/free access. The existing `grok` API-key provider remains valid. External translation can normalize documented OpenAI/Responses requests, but cannot bypass xAI entitlement or make protected web routes legitimate API endpoints.

## GitHub provider adapter audit sources (2026-08-13)

Initial public sources for the expanded provider audit:

- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md — Hermes documented inference-provider integrations.
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/adding-providers.md — Hermes provider/auth/adapter extension guidance.
- https://github.com/router-for-me/CLIProxyAPI — multi-provider CLI proxy with documented OAuth and API-key provider paths.
- https://github.com/diegosouzapw/OmniRoute — local gateway with OAuth/API-key provider catalog; its published catalog also contains web-cookie and catalog-only categories that are excluded from this gateway.
- https://github.com/diegosouzapw/OmniRoute/wiki/Architecture — public architecture description for modular OAuth/provider modules.
- https://github.com/aws-solutions-library-samples/guidance-for-multi-provider-generative-ai-gateway-on-aws — official AWS multi-provider gateway reference.

These sources will be classified into official OAuth/device-code, API-key, user-owned local, catalog-only documented endpoint, and excluded web-cookie/session/MITM categories before implementation. No provider will be enabled solely because a public repository contains code for it.

A targeted GitHub tree audit found that CLIProxyAPI and OmniRoute contain many provider-specific modules for Codex, Claude, Qwen, Grok, Kimi, Gemini, OpenCode, and Copilot. The same public trees also contain browser-interception, web-cookie, token-replay/cache, and CDP/browser helper modules. Therefore repository presence alone is not sufficient to treat a provider as a safe OAuth adapter. Each provider must be accepted only when the OAuth/device/API-key contract is official or the endpoint is user-owned/local; web-cookie, browser/CDP and session replay modules remain excluded.

## Official OAuth inference audit — Gemini and Hugging Face (2026-08-13)

- Google Gemini API officially documents OAuth as an alternative to API keys. A Cloud project must enable the Generative Language API and configure OAuth consent/client credentials. Application Default Credentials can request `https://www.googleapis.com/auth/cloud-platform` and `https://www.googleapis.com/auth/generative-language.retriever`; bearer tokens can call `https://generativelanguage.googleapis.com/v1/models` with `x-goog-user-project`. Google OAuth supports authorization-code, installed-app, device/limited-input, and service-account patterns, with scoped refresh tokens. Sources: https://ai.google.dev/gemini-api/docs/oauth ; https://developers.google.com/identity/protocols/oauth2
- Hugging Face officially supports OAuth authorization code with PKCE (including public apps), client-secret apps, and device-code OAuth. Its explicit `inference-api` OAuth scope authorizes inference requests to Inference Providers on behalf of the user; `read-endpoints` grants viewing/inference to user endpoints. Public apps can have no secret. Official endpoints include `https://huggingface.co/oauth/authorize`, `https://huggingface.co/oauth/device`, and `https://huggingface.co/oauth/token`. Sources: https://huggingface.co/docs/hub/en/oauth ; https://huggingface.co/docs/inference-providers/en/index
- Hugging Face Inference Providers use OpenAI-compatible `https://router.huggingface.co/v1` with a user credential and advertise a free tier subject to provider/account policy. The gateway should represent OAuth-backed HF inference distinctly from static fine-grained token credentials.

## Official cloud and workspace authorization audit — Azure, AWS, Cloudflare, and GitLab (2026-08-13)

- Azure OpenAI officially permits inference with Microsoft Entra ID bearer tokens instead of a static API key. The resource must have a custom subdomain and the caller needs a suitable Cognitive Services OpenAI role; local `az login`, managed identities, and service principals are supported. Data-plane inference uses the `https://ai.azure.com/.default` token audience. Source: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/managed-identity
- Amazon Bedrock authorizes model inference through AWS IAM identities and signed requests, with `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:Converse`, and related permissions. This is IAM/role identity rather than OAuth browser consent. Source: https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples.html
- Cloudflare Workers AI REST inference requires an account ID plus a Workers AI API token with Workers AI permissions. The token is a static API token, not an OAuth inference grant. Source: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- GitLab Duo model selection is an entitlement-controlled GitLab feature tied to Premium/Ultimate and Duo offerings. The public page describes model selection inside GitLab, not a generic third-party OpenAI-compatible inference OAuth API. Source: https://docs.gitlab.com/user/gitlab_duo/model_selection/

## Official inference OAuth audit — OpenAI, Anthropic, and GitLab (2026-08-13)

Official OpenAI API platform documentation describes API-key based API access and does not document a third-party OAuth inference grant. OpenAI user OAuth or Codex/ChatGPT subscription login must therefore not be represented as a generic external inference OAuth integration. Sources: https://developers.openai.com/api/reference/overview and https://developers.openai.com/api/docs

Official Anthropic API authentication documentation specifies the `x-api-key` direct API header. Claude Code login is a separate product authentication flow and is not documented as a third-party OAuth program for arbitrary inference proxies. Sources: https://platform.claude.com/docs/en/manage-claude/authentication and https://code.claude.com/docs/en/authentication

GitLab REST API can use OAuth access tokens for general GitLab API access, but the documented GitLab Duo Chat completions endpoint is marked internal use only and should not be exposed as a generic OpenAI-compatible inference OAuth route. Sources: https://docs.gitlab.com/api/rest/ and https://docs.gitlab.com/api/chat/

## Kiro official authentication audit (2026-08-14)

- Official Kiro authentication docs distinguish browser-based interactive sign-in from API key authentication for non-interactive/headless CLI use.
- Kiro browser sign-in can use identity providers such as GitHub, Google, AWS Builder ID, and AWS IAM Identity Center. That interactive identity is not treated as a generic gateway bearer credential without an explicit documented API token grant.
- Kiro CLI headless documentation states that API key authentication is the appropriate automated/non-interactive path and is available to eligible paid Kiro plans.
- Gateway-safe Kiro support remains official API key/auth token or an explicitly authorized endpoint, with encrypted import, model discovery where supported, health verification, and status reporting. No browser callback capture, cookies, browser storage, or session extraction is eligible for the gateway.

Sources: https://kiro.dev/docs/getting-started/authentication/ ; https://kiro.dev/docs/cli/headless/ ; https://kiro.dev/

### Implementation status (2026-08-14)

The gateway’s Kiro provider profile now exposes the paid-plan, authorized-endpoint requirement directly in dashboard status, retains the note after a provider is configured, and explicitly excludes browser OAuth, cookies, passwords, browser sessions, and intercepted traffic. The encrypted credential import UI documents both `apiKey` and `token` formats. Regression coverage verifies bearer-token configuration, API-key fallback status, secret redaction, Kiro’s no-OAuth directory metadata, and the provider’s authorized-endpoint guidance.

Sources: https://kiro.dev/docs/getting-started/authentication/ ; https://kiro.dev/docs/cli/headless/ ; https://kiro.dev/


## OAuth/auth-method audit update — Hugging Face and xAI (2026-08-14)

| Provider | Officially documented inference authorization methods | Gateway audit conclusion | Source |
|---|---|---|---|
| Hugging Face Inference Providers | Fine-grained API token; OAuth authorization code + PKCE; OAuth device code; Enterprise token exchange for organization workflows. The `inference-api` and `read-endpoints` scopes authorize inference-related access. | The existing authorization-code/PKCE integration is valid. Device-code is a valid additional gateway flow because it uses the provider’s published `/oauth/device` and `/oauth/token` endpoints with explicit user consent; it must keep the opaque device code server-side. Enterprise token exchange is not added because it requires separate organization entitlements and a dedicated administrator-controlled setup. | [HF OAuth](https://huggingface.co/docs/hub/en/oauth); [HF Inference Providers](https://huggingface.co/docs/inference-providers/en/index) |
| xAI API | Direct inference is documented with an xAI team API key as an HTTP Bearer token. The Grok Build CLI documentation separately describes browser OIDC and RFC 8628 device-code session authentication, but this is a CLI/enterprise deployment authentication path rather than xAI’s public API inference OAuth contract. | Keep the direct `grok` API-key provider as the official external API path. The separate subscription OAuth profile must be explicitly labeled as Grok Build/CLI entitlement-backed rather than being presented as a generic xAI public API OAuth method. No browser session or CLI token import is permitted. | [xAI API quickstart](https://docs.x.ai/developers/quickstart); [xAI Management API authentication](https://docs.x.ai/developers/rest-api-reference/management/auth); [Grok Build Enterprise authentication](https://docs.x.ai/build/enterprise) |

> Device-code implementation rule: return only `verification_uri`, `user_code`, expiry, interval, and an opaque gateway state to the authenticated administrator. Retain the provider `device_code` solely in protected server-side state and store only the successful access/refresh tokens in encrypted storage.



## Authorization-method implementation update (2026-08-14)

The gateway catalog now classifies provider access by **official authorization method**. A free-tier or catalog label is not an access grant: it becomes usable only when the provider publishes an official API or OAuth inference entitlement for the connected account.

| Provider family | Gateway methods surfaced | Verified boundary |
|---|---|---|
| Gemini / Vertex AI | API key; authorization code + PKCE; device authorization; external service account / ADC setup | Device authorization requires an administrator-owned OAuth client and enabled Cloud project. Browser-chat sessions are not imported. [Google Gemini OAuth](https://ai.google.dev/gemini-api/docs/oauth) |
| Azure OpenAI | Resource API key; Entra authorization code + PKCE; device code; external service principal or managed identity | Resource access remains subject to Azure OpenAI RBAC. Managed identity and service-principal material are deployment configuration, not dashboard browser credentials. [Azure managed identity](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/managed-identity) |
| Hugging Face | API key; authorization code + PKCE; device code | Uses documented OAuth endpoints and inference scopes. [Hugging Face OAuth](https://huggingface.co/docs/hub/en/oauth) |
| Manus | Official Open App authorization code + PKCE | User/application consent with encrypted refresh-token storage. |
| Notion | Official workspace connector authorization-code flow | Connector-only; it does not convert a third-party UI into an inference API. |
| xAI / Grok | Existing entitlement-backed PKCE profile plus official xAI API key | No additional device endpoint was added because a provider-published endpoint was not independently confirmed. [xAI quickstart](https://docs.x.ai/developers/quickstart) |
| OpenAI, Anthropic, Qwen, MiMo, Kimi, DeepSeek, Mistral, Cohere, Perplexity, OpenRouter, Together, Fireworks, Cerebras, SambaNova, NVIDIA NIM, Cloudflare Workers AI, Vercel AI Gateway, GitLab, Kiro, Lovable | Official API key, bearer token, cloud/workload identity, or explicit compatible endpoint per provider profile | No generic third-party inference OAuth/device flow was added without a provider-published authorization contract. |
| AWS Bedrock | AWS IAM access keys/session credentials/workload role | SigV4 and IAM roles are workload identity, not OAuth browser consent. |
| OpenCode, Ollama, LM Studio | Local/self-operated endpoint and loopback no-auth where documented | Never classified as remote third-party no-auth or browser-session access. |

### Implemented controls

`POST /api/gateway/oauth/[provider]/device` is admin-protected and implements the official device-code pattern only for profiles with a documented device endpoint. It writes a short-lived opaque server-side state record, returns only the user code and official verification URL, enforces polling intervals, handles `authorization_pending` and `slow_down`, deletes state after completion/error, and encrypts a token only after a successful exchange. The provider device code is never returned to the browser.

The provider catalog now displays the official access category, published and discovered models, encrypted credential-pool readiness, expired-account count, authorization methods, and existing safe model-discovery/credential-verification actions. Browser cookies, passwords, captured sessions, private headers, and free web-chat account conversion remain explicitly unsupported.

### Regression coverage

- `tests/oauth-device-code.test.js`: opaque state, enforced interval, pending response, success-only token import, and device-code redaction.
- `tests/gemini-config.test.js`: Gemini, Hugging Face, and Azure device-code metadata and normalized endpoint visibility.
- Production build validates the device OAuth route and categorized dashboard compile path.
