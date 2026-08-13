# Prexzy Live API QA Summary

## Endpoint tested

The endpoint was tested as `https://vip.prexzyapis.com` with the `/v1` path added by the QA harness. The API key was supplied only through the process environment and is not included in this report.

## Result

The corrected run completed with **13 PASS, 2 FAIL, and 4 BLOCKED** checks. The initial run used a `/v1` base URL while the harness also appended `/v1`, producing `/v1/v1/...`; that was corrected before evaluating compatibility.

| Area | Outcome | Evidence |
|---|---|---|
| Supplied-key authentication | Pass | `GET /v1/models` returned HTTP 200 and 15 models. |
| Invalid-key rejection | Pass | Invalid key returned HTTP 401. |
| Model discovery | Blocked in the unauthenticated first probe, then succeeded with the supplied key | 15 model IDs were discovered after authentication. |
| `claude-fable-5` chat | Pass | HTTP 200 OpenAI-shaped completion with one choice. |
| `claude-fable-5[1m]` chat | Pass | HTTP 200 OpenAI-shaped completion. |
| Claude Opus/Sonnet-labelled models | Mixed | Most tested variants returned HTTP 200; `claude-opus-4-8` returned HTTP 402 while its `[1m]` variant passed. |
| Streaming | Pass | HTTP 200 with `text/event-stream` and SSE chunks. |
| JSON response format | Pass | HTTP 200 OpenAI-shaped response. |
| Tool request | Pass at envelope level | HTTP 200 OpenAI-shaped response; this run did not prove that a tool call was actually emitted, so native tool behavior remains only partially verified. |
| Invalid model | Pass | HTTP 404 with `model_not_found`. |
| Malformed JSON | Fail | Endpoint returned HTTP 500 `Internal server error`, rather than a clean 4xx JSON validation response. |
| Image-labelled Gemini models | Blocked | HTTP 502 from the upstream/Cloudflare path. |
| Concurrency | Not run | The harness requires explicit concurrency approval before sending five live requests. |

## Authenticity conclusion

The successful responses establish **protocol compatibility and reachability**, not proof that the advertised Claude or Opus backend is genuine. The response model fields and latency measurements are behavioral evidence only. A separate bounded authenticity audit with canary prompts, context probes, and response-shape analysis is required before making any real-model identity claim.

## Important operational finding

Use `https://vip.prexzyapis.com` as the base host with this QA harness. Do not include `/v1` in `PROXY_BASE_URL`, because the harness appends `/v1` to each endpoint path. The redacted full evidence is in `docs/prexzy-live-qa-report-corrected.json`.
