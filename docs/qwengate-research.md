# QwenGate Repository Research

Research date: 2026-08-12.

## Exact repository

The repository the user meant is [youssefvdel/qwengate](https://github.com/youssefvdel/qwengate). GitHub reports an MIT license, approximately 147 stars, 34 forks, and a TypeScript/Bun implementation. The repository’s default branch is `dev`; public documentation also uses the historical `qwen-gate` URL in some install commands.

## What QwenGate does

QwenGate is an OpenAI-compatible gateway for Qwen web access. Its README describes browser automation against `chat.qwen.ai`, multi-account rotation, session pooling, browserless transport, dashboard account management, tool-call parsing, streaming SSE, content cleanup, and file upload handling. It exposes `/v1/chat/completions` and `/v1/models`.

## Security and boundary assessment

QwenGate is materially different from the current compliant gateway because its core architecture uses browser automation and persistent sessions for Qwen web access. Its documentation explicitly describes entering Qwen email/password credentials, browser session pooling, account rotation, browser-derived headers/tokens, and using multiple accounts to avoid cooldown limits. These are precisely the browser-session and account-pooling practices excluded by this project’s Safe Boundary.

The repository’s `SECURITY.md` lists session/cookie management and account credential storage within scope. The README states that it is educational, not affiliated with Alibaba/Qwen, and subject to the terms of `chat.qwen.ai`.

## Safe reusable ideas

The following ideas are safe to adapt independently without importing Qwen web sessions or browser credentials:

1. OpenAI-compatible request/response and SSE shape compatibility.
2. Bounded tool-call parsing with JSON-schema validation and no gateway-side tool execution.
3. Content-artifact filtering for provider-specific reasoning/XML markers, with caution not to remove legitimate user content.
4. Model health/cooldown state and explicit fallback ordering for user-owned API-key providers.
5. Lightweight dashboard concepts for request logs, model health, and latency.
6. File/context-size handling only when implemented with explicit inline inputs or documented provider APIs; no browser upload/session extraction.

## Components excluded

Do not copy or enable QwenGate’s browser authentication, email/password collection, browser profiles, session pool, token extraction, browser-derived headers, network debugging that captures private client traffic, account rotation, or “free/cooldown bypass” workflow. These are not converted into official API credentials and are not part of the compliant gateway.

## Official Qwen path

The current gateway continues to use documented Alibaba ModelStudio/DashScope API-key endpoints for Qwen. Legacy browser OAuth/session flows are not treated as official API authorization.

## References

1. [QwenGate repository](https://github.com/youssefvdel/qwengate)
2. [QwenGate Security Policy](https://raw.githubusercontent.com/youssefvdel/qwengate/main/SECURITY.md)
3. [QwenGate Architecture](https://raw.githubusercontent.com/youssefvdel/qwengate/main/docs/ARCHITECTURE.md)
4. [QwenGate API Reference](https://raw.githubusercontent.com/youssefvdel/qwengate/main/docs/API.md)
5. [Official Qwen Code model-provider documentation](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/)
