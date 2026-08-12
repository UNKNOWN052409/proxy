# Provider model-list implementation sources

The gateway’s safe provider health and model-refresh implementation uses documented model-list endpoints rather than browser interception or scraping.

| Provider type | Documented endpoint and authorization | Use in this repository |
|---|---|---|
| OpenAI-compatible | `GET /models` with `Authorization: Bearer $OPENAI_API_KEY` | The gateway uses `baseUrl + /models` to validate a configured explicit provider credential and cache at most 1,000 model IDs. |
| Anthropic | `GET /v1/models` with `x-api-key: $ANTHROPIC_API_KEY` and `anthropic-version: 2023-06-01` | The gateway uses `baseUrl + /models?limit=1000` to validate a configured explicit provider credential and cache at most 1,000 model IDs. |

The OpenAI reference describes `GET /models` as listing currently available models, with model IDs that can be referenced in API endpoints. The Anthropic reference describes `GET /v1/models` as listing available models and supports a `limit` parameter from 1 through 1,000.

## Sources

[1] OpenAI, [List models](https://developers.openai.com/api/reference/resources/models/methods/list/).

[2] Anthropic, [List Models](https://platform.claude.com/docs/en/api/models/list).
