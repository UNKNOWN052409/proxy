# Authorized Endpoint Model Activity Audit

**Audit date:** 2026-08-14
**Scope:** One authenticated registry request and one minimal, non-destructive OpenAI-compatible chat request for every returned model ID. A focused follow-up then tested the only chat-successful model for streaming, JSON mode, and tool calling. The supplied credential was loaded from a temporary local file and deleted immediately after each run. No credential value is recorded in this document or its linked JSON evidence.

> **Definition.** A model is marked **confirmed active** only when the endpoint returns HTTP `200` with an OpenAI-compatible completion object containing a non-empty `choices` array. Being present in `/v1/models` alone is classified as **listed**, not as active.

## Executive Result

The authenticated registry returned **15 model IDs**. Exactly **one model, `gpt-5.6-sol`, was confirmed active** by a successful minimal chat response. Its focused follow-up also succeeded for SSE streaming, JSON-mode input, and a tool-call request. One model returned an entitlement/billing-style `402`, and the other 13 models returned upstream `502` errors. A `502` does not establish that the underlying model is absent or fake; it means the endpoint did not provide a usable completion at the audit time.

| Classification | Count | Meaning |
|---|---:|---|
| Confirmed active | 1 | Successful OpenAI-compatible chat completion returned |
| Listed but currently upstream-blocked | 13 | Registry-visible, but minimal chat returned `502` |
| Listed but entitlement-blocked | 1 | Minimal chat returned `402` |

## Per-Model Matrix

| Model ID | Registry-visible | Minimal chat result | Activity classification | Notes |
|---|---|---:|---|---|
| `claude-fable-5` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-fable-5[1m]` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-opus-4-8` | Yes | `402` | Listed; entitlement-blocked | Upstream returned an error rather than a completion |
| `claude-opus-4-8[1m]` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-opus-5` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-opus-5[1m]` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-sonnet-5` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `claude-sonnet-5[1m]` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `gemini-3-pro-image` | Yes | `502` | Listed; upstream-blocked | Chat compatibility could not be verified; image capability was not inferred |
| `gemini-3.1-flash-image` | Yes | `502` | Listed; upstream-blocked | Chat compatibility could not be verified; image capability was not inferred |
| `gemini-3.1-flash-lite-image` | Yes | `502` | Listed; upstream-blocked | Chat compatibility could not be verified; image capability was not inferred |
| `glm-5.2` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `gpt-5.6` | Yes | `502` | Listed; upstream-blocked | No completion received |
| `gpt-5.6-sol` | Yes | `200` | **Confirmed active** | Chat, streaming, JSON mode, and tool-call request succeeded |
| `kimi-k3` | Yes | `502` | Listed; upstream-blocked | No completion received |

## Focused Capability Validation: `gpt-5.6-sol`

| Capability | HTTP result | Verified status |
|---|---:|---|
| OpenAI-compatible minimal chat | `200` | **Passed**; response included `id`, `object`, `model`, `choices`, and `usage` |
| SSE streaming | `200` | **Passed**; response used `text/event-stream` and emitted `data:` chunks |
| JSON-mode input | `200` | **Passed**; endpoint accepted `response_format: {"type":"json_object"}` and returned a completion object |
| Tool-call request | `200` | **Passed**; endpoint accepted OpenAI-style `tools`, `tool_choice`, and `parallel_tool_calls` fields and returned a completion object |

The tool-call probe verifies endpoint acceptance and a compatible completion response. It does **not** by itself prove that the returned completion contained a tool invocation, because the sanitized evidence intentionally records structural metadata rather than retaining response content.

## Endpoint-Level Findings

The authenticated `/v1/models` request returned `200` and the invalid-key request returned `401`, which confirms that the endpoint recognizes the supplied credential and rejects a deliberately invalid credential. The endpoint also returned a clean `404` for an unknown model. Its malformed-JSON request returned `500`, which is an upstream API quality issue and not a successful validation result.

## Evidence

The raw, sanitized per-request records are retained in the repository. They include response status, latency, model IDs, response structure, and short redacted previews; they exclude credentials and authorization headers.

| Evidence file | Purpose |
|---|---|
| `docs/real-qa-all-models-2026-08-14.json` | One real minimal-chat probe for each of the 15 registry-visible models |
| `docs/real-qa-gpt-5.6-sol-2026-08-14.json` | Focused real chat, streaming, JSON-mode, and tool-call probes for the confirmed active model |
| `scripts/real-qa.py` | Reproducible bounded audit harness with optional all-model and model-ID filtering |

## Operational Recommendation

Route only `gpt-5.6-sol` to this endpoint by default right now. Keep the other listed IDs in a quarantined or unverified state and retest them only after the upstream provider resolves its `502` failures or the relevant account entitlement is corrected. Do not treat registry exposure, branding, response latency, or a model name as proof of real backend identity.
