# Qwen integration research

Date checked: 2026-08-12.

## Sources

1. Qwen Gate repository: https://github.com/youssefvdel/qwengate
2. Official Qwen Code authentication: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/
3. Official Qwen Code model providers: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
4. Official Qwen Code troubleshooting: https://qwenlm.github.io/qwen-code-docs/en/users/support/troubleshooting/
5. Official Qwen API platform: https://qwen.ai/apiplatform
6. Official Qwen Code daemon: https://qwenlm.github.io/qwen-code-docs/en/users/qwen-serve/

## Findings

Qwen Gate is an MIT-licensed third-party project that describes itself as an OpenAI-compatible gateway for chat.qwen.ai. Its README explicitly says it uses browser automation for Qwen access, asks users to enter Qwen email and password, persists browser sessions, uses browserless token extraction helpers, and recommends multiple accounts for round-robin rotation/cooldown avoidance. This is not an official Qwen server-to-server API contract and is outside the compliant gateway boundary for this project.

The official Qwen Code authentication documentation states that the Qwen OAuth free tier was discontinued on 2026-04-15. Qwen OAuth is no longer a selectable authentication dialog entry, and new requests are expected to be rejected; existing cached tokens may only continue briefly. The documented alternatives are Alibaba ModelStudio Coding Plan, Token Plan, Standard API Key, third-party provider API keys, and a custom provider.

The official Qwen Code model-provider documentation supports OpenAI-compatible endpoints through `openai`, custom provider IDs mapped to the OpenAI protocol, Anthropic, Gemini, and Vertex AI. It documents Qwen/Alibaba ModelStudio endpoints and API-key environment variables, including the Coding Plan endpoints `https://coding.dashscope.aliyuncs.com/v1` and `https://coding-intl.dashscope.aliyuncs.com/v1`.

The official Qwen API Platform advertises Chat Completions, Realtime, Batch, function calling, and multimodal Qwen models. These official API surfaces are suitable for a direct provider adapter when the user supplies an authorized API key or official OAuth/enterprise authorization.

The official Qwen daemon documentation describes `qwen serve` as experimental, local-only, and primarily text-only in the referenced alpha scope. It supports loopback operation, optional bearer token protection, and local systemd/launchd/nohup/tmux startup. It explicitly defers production-grade remote/containerized/nginx deployment in that alpha scope.

## Implementation decision

Do not port Qwen Gate's browser login, cookie/session persistence, token extraction, account pooling for cooldown avoidance, or MITM/browser-network interception. Implement Qwen support through official ModelStudio/Coding Plan/API-key endpoints and documented OpenAI-compatible mappings. If Qwen later publishes a current official OAuth authorization-code/device flow that grants API access, add it through the encrypted OAuth credential store without handling browser cookies or private client tokens. Mark the old Qwen OAuth flow as unavailable in the UI rather than offering a broken or misleading login.
