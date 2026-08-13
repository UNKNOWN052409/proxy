# GitHub Gateway Repository Research

Research date: 2026-08-12.

## Candidate repositories

| Repository | URL | License | Relevant capability | Safe integration assessment |
|---|---|---|---|---|
| Portkey Gateway | https://github.com/Portkey-AI/gateway | MIT | TypeScript AI gateway, provider routing, guardrails, retries/fallback concepts, observability | Good reference for policy/guardrail and routing patterns. Do not copy the full gateway because it is much larger than the current lightweight runtime. |
| LiteLLM | https://github.com/BerriAI/litellm | Other | Broad provider coverage, OpenAI-compatible gateway, cost tracking, load balancing, guardrails, logging | Useful feature reference, but license and Python/runtime footprint require careful review before code reuse. Prefer interface ideas and official provider docs rather than direct vendoring. |
| OpenProvider | https://github.com/OpenProviderAi/OpenProvider | MIT | Lightweight TypeScript/Next.js multi-provider gateway, catalog sync, auto fallback, model health/latency UI, server-side provider keys | Strong candidate for adapting safe catalog and health-aware routing ideas. Its own authentication/session UI is not an upstream credential-import mechanism. |
| awesome-ai-gateway | https://github.com/cuihuan/awesome-ai-gateway | CC0-1.0 | Comparative landscape, benchmarks, security/compliance taxonomy, gateway selection references | Safe documentation reference; no runtime code integration required. |
| Qwen official repository/docs | https://github.com/QwenLM/qwen and https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/ | Varies / official docs | Official Qwen model/provider information | Use official ModelStudio API contracts only. Do not use browser-session or discontinued OAuth flows. |

## Excluded candidates and reasons

The repository search surfaced projects describing browser-harvested cookies, web-session access, free-tier aggregation, or account pooling. Those are outside the gateway Safe Boundary and must not be integrated. Unlicensed or unclear-license repositories are also not suitable for direct code reuse without explicit permission.

## Sources

1. [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway)
2. [BerriAI/litellm](https://github.com/BerriAI/litellm)
3. [OpenProviderAi/OpenProvider](https://github.com/OpenProviderAi/OpenProvider)
4. [cuihuan/awesome-ai-gateway](https://github.com/cuihuan/awesome-ai-gateway)
5. [Qwen Code model providers](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/)
