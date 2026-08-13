# Real-Data Gateway QA Summary

**Run date:** 2026-08-13
**Endpoint:** `https://vip.prexzyapis.com`
**Model hint:** `claude-fable-5`
**Evidence policy:** No mocks were used by the live harness. Secrets and authorization headers are redacted from the report.

## Executive result

The gateway’s local routing and reliability implementation is operational, and the repository gateway suite passed **34/34 tests**. Model catalog import and refresh parsing passed **2/2 targeted tests**. Native coverage for the targeted import run was **28.17% line coverage overall**, with **73.87% branch coverage** and **11.50% function coverage**; this is test coverage, not a claim of production completeness.

The supplied endpoint is reachable and accepts the supplied key for at least one request: the authenticated model listing returned HTTP 200 with **15 model identifiers**. An invalid key returned HTTP 401. A real streaming request returned HTTP 200 with `text/event-stream`, and a tools-shaped request returned HTTP 200 with an OpenAI completion envelope. These are protocol observations only; the tools result did not prove that the upstream executed a tool call, and no model authenticity conclusion is justified from these observations.

Most per-model chat probes were **blocked by transport instability**, including `SSLError`, `ReadTimeout`, and one HTTP 502 from the upstream/edge. Therefore, the live run does **not** establish that `claude-fable-5`, Opus-labelled models, Sonnet-labelled models, or Gemini-labelled models are authentic or consistently usable. It also does not establish reliable JSON-mode behavior, malformed-request handling, invalid-model handling, or approved concurrency behavior.

| Area | Result | Evidence | Interpretation |
|---|---:|---|---|
| Authenticated model list | PASS | HTTP 200; 15 IDs | Key was accepted for this request |
| Invalid-key rejection | PASS | HTTP 401 | Basic auth boundary behaved correctly |
| Basic per-model chat | BLOCKED | TLS/read-timeout/502 results | Upstream transport is not stable enough for model claims |
| Streaming envelope | PASS | HTTP 200; SSE content type | Streaming protocol path responded once |
| Tools envelope | PASS, limited | HTTP 200; completion-shaped JSON | No proof of actual tool execution |
| JSON mode | BLOCKED | TLS error in this run | Must be rerun after transport stabilization |
| Negative requests | BLOCKED | TLS errors | Must be rerun after transport stabilization |
| Approved concurrency | NOT RUN | Explicit approval flag absent | Intentionally not load-tested |
| Model authenticity | UNVERIFIED | Canary/TTFT evidence unavailable | No anti-spoofing verdict should be issued |

## Changes made during this continuation

The real-data QA harness now covers model discovery, invalid and supplied-key authentication, bounded model probes, streaming, tools, JSON mode, malformed JSON, invalid models, and an opt-in five-request concurrency check. It writes structured redacted evidence to `docs/real-qa-report.json` and is configured through environment variables rather than embedding credentials.

The account store now supports a compatibility fallback when a SQLite runtime does not expose `transaction()`. Tier detection now handles account summaries that omit plaintext credentials by retrieving the stored representation for internal probes, and batch detection can distinguish transport failures from ordinary free-tier results. These changes preserve the default safe fallback for single-account tier detection.

## Safe Boundary audit

No cookie scraping, browser-session extraction, credential interception, third-party login MITM, free-tier bypass, or undocumented private web-app endpoint capture was added. The gateway remains limited to user-supplied API credentials, documented or user-authorized provider endpoints, encrypted local credential storage, and OpenAI-compatible request/response translation. Live testing was performed against the user-supplied API endpoint only.

## Remaining blockers

The primary blocker is upstream transport reliability. The endpoint should be retested from the target VPS with certificate-chain, DNS, IPv4/IPv6, reverse-proxy, origin-health, and timeout checks. Until repeated authenticated requests succeed from that VPS, the gateway must keep model status as **unverified** and should not automatically route production traffic to models that fail health or canary checks.

The repository’s account and tier tests still contain legacy fixtures shorter than the schema’s eight-character password requirement and share a singleton SQLite store across test scopes. Those failures are test-suite hygiene issues and should be corrected in the tests or isolated with per-test stores; they are not evidence that live API requests succeeded. The gateway suite itself remains green.

## Reproduction

```bash
cd /home/ubuntu/proxy
PROXY_BASE_URL='https://vip.prexzyapis.com' \
PROXY_API_KEY='REDACTED' \
PROXY_MODEL_ID='claude-fable-5' \
QA_OUTPUT='docs/real-qa-report.json' \
python3 scripts/real-qa.py
```
