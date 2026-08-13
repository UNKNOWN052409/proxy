# Real-Data Gateway QA Matrix

## Inputs

| Variable | Value/status |
|---|---|
| `PROXY_BASE_URL` | `https://vip.prexzyapis.com` |
| `PROXY_API_KEY` | Supplied by user; never stored in this document or logs |
| `PROXY_MODEL_ID` | `claude-fable-5` from the preceding user-provided model context |
| API style | Intended OpenAI-compatible/custom endpoint; must be confirmed by live response |
| Test policy | Real requests only for evidence; minimal tokens; no load test without confirmation |

## Executable low-cost tests

| ID | Area | Test | Evidence |
|---|---|---|---|
| ENV-01 | Environment | HTTPS, DNS, base URL and `/v1` path handling | Status, TLS, latency |
| AUTH-01 | Authentication | Missing key | Redacted status/error schema |
| AUTH-02 | Authentication | Invalid key | Redacted status/error schema |
| AUTH-03 | Authentication | Supplied key | Status and redacted response shape |
| MOD-01 | Model registry | `GET /v1/models` | Model IDs and OpenAI object shape |
| MOD-02 | Model verification | One request for each discovered model, with supplied model as fallback | Status, model field, latency |
| CHAT-01 | Chat | Minimal non-streaming completion | Schema, assistant content, usage |
| CHAT-02 | Parameters | Minimal supported parameter variants | Status and clean errors |
| STREAM-01 | Streaming | `stream=true`, low token budget | SSE/chunk shape and close behavior |
| TOOL-01 | Tools | One minimal declared function | Tool-call shape or clean unsupported error |
| JSON-01 | Structured output | JSON object request | Valid JSON or clean unsupported error |
| ERR-01 | Error handling | Invalid model, empty messages, malformed fields | Status, JSON error, no stack trace |
| SEC-01 | Secret safety | Search response/error bodies for key fragments | No secret echo |
| COMP-01 | SDK compatibility | OpenAI-compatible request shape | Schema compatibility |
| OBS-01 | Observability | Request ID and safe latency metadata | No payload/secret leakage |

## Conditional tests

These execute only when the live catalog or advertised capabilities make them applicable: embeddings, audio, image generation, direct vision, image URL/base64 input, JSON schema mode, fallback routing, provider failover, rate-limit behavior, concurrency of five requests, and CLI-specific model import.

## Blocked or explicitly excluded tests

No undocumented route enumeration, cookie/session extraction, MITM interception, free-tier bypass, password handling, hidden endpoint discovery, or high-volume load test will be performed. A model cannot be classified as real/fake from naming or latency alone; authenticity is reported as verified, suspicious, or unverified based on observable response evidence.

## Classification rules

`PASS` means the live response met the expected contract. `FAIL` means the endpoint returned a contradictory or malformed response. `BLOCKED` means the required capability or live transport was unavailable. `UNVERIFIED` means there was not enough observable evidence to determine model identity or provider behavior.

## Budget

The suite is bounded to one discovery sequence, at most one completion per discovered model, one streaming request, one tools request, one JSON request, and five concurrent requests only if the endpoint is healthy and the user has approved the bounded concurrency check.

## Required final report

The final report will include test ID, feature, request summary, expected result, actual result, status, HTTP status, latency, redacted evidence, severity, reproduction steps for failures, totals, critical issues, fixes needed, and a readiness score out of ten.

## Variables for the automated harness

```bash
PROXY_BASE_URL='https://vip.prexzyapis.com'
PROXY_API_KEY='set only in the process environment'
PROXY_MODEL_ID='claude-fable-5'
```

The key must be supplied at execution time and must not be committed, printed, or written into reports.

## Current gate

The supplied endpoint previously returned anonymous `401` for `/v1/models` but authenticated transport timed out. Until an authenticated JSON model catalog or completion response is observed, model, tools, streaming, vision, and authenticity results remain `BLOCKED` or `UNVERIFIED`, not successful.

## References

[1]: https://github.com/openai/openai-openapi/blob/master/openapi.yaml "OpenAI-compatible API schema reference"
[2]: https://platform.openai.com/docs/api-reference "OpenAI API reference"
[3]: https://platform.openai.com/docs/guides/function-calling "Tool calling reference"
[4]: https://platform.openai.com/docs/api-reference/streaming "Streaming reference"

The matrix is derived from the user-provided `pasted_content.txt`; references are included only for protocol terminology and expected OpenAI-compatible shapes.

Last updated: 2026-08-13
Author: Manus AI
