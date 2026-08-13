# Iterative QA and Coverage Report

## Automated implementation cycle

The gateway was extended with deterministic tests for health refresh, encrypted credential-pool behavior, OpenAI-compatible adapter behavior, and vision fallback. No cookie scraping, session-token extraction, login interception, password import, or undocumented third-party account conversion was added.

The maintained suite currently passes **126/126 tests**. The production build compiles successfully and generates all static pages.

| Scope | Line | Branch | Function |
|---|---:|---:|---:|
| Maintained aggregate | **85.96%** | **73.18%** | **87.66%** |
| `gateway/health.js` | 88.79% | 81.25% | 86.67% |
| `gateway/openai.js` | 100.00% | 86.36% | 100.00% |
| `gateway/vision.js` | 100.00% | 96.00% | 100.00% |
| `storage/sql-store.js` | 100.00% | 83.78% | 100.00% |
| `config/store.js` | 100.00% | 88.00% | 100.00% |
| Credential pool isolated suite | 98.97% | 74.19% | 100.00% |

The aggregate does not include the credential test file because it intentionally changes into an isolated temporary working directory before importing the credential store. Its standalone result is recorded separately and passed **3/3**.

## Live Prexzy evidence

The authenticated model registry returned **15 model IDs**:

`claude-fable-5`, `claude-fable-5[1m]`, `claude-opus-4-8`, `claude-opus-4-8[1m]`, `claude-opus-5`, `claude-opus-5[1m]`, `claude-sonnet-5`, `claude-sonnet-5[1m]`, `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `glm-5.2`, `gpt-5.6`, `gpt-5.6-sol`, and `kimi-k3`.

With a bounded 15-second timeout, the live matrix produced **12 PASS, 2 FAIL, and 5 BLOCKED** results. The Claude-labelled models tested successfully except `claude-opus-4-8`, which returned HTTP 402. The image-labelled Gemini probes returned upstream HTTP 502. Streaming and JSON mode passed on `claude-fable-5`; the tools probe was blocked by an upstream HTTP 502 in that run, so actual native tool-call emission remains unverified. Invalid-model handling returned a clean HTTP 404 with `model_not_found`. Malformed JSON returned HTTP 500, which is an upstream protocol defect rather than proof of a local gateway failure.

A successful HTTP 200 confirms reachability and response-envelope compatibility only. It does not prove that the hidden backend is genuinely the advertised model. Authenticity requires additional behavioral canary and context-window evidence.

## Remaining gaps

The largest untested source areas remain provider configuration branches, credential edge branches, audit persistence, custom endpoint conversion, OAuth state handling, Bedrock signing/listing, GitLab adapter branches, runtime-store failure paths, and provider-specific OpenAI/Qwen adapters. These are the next candidates for deterministic tests. External provider failures and hidden-backend authenticity cannot be made 100% covered by local tests; they must remain explicitly classified as live-data evidence.
