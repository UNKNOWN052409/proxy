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
