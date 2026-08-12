# Authorized Endpoint Audit

The gateway includes an authenticated endpoint-audit route for providers that the user has explicitly configured and authorized. The audit performs a bounded model-list request and, when a model is configured, a small deterministic chat probe. It does not scrape browser sessions, extract system prompts, store provider responses, or execute tools.

## What is checked

The audit compares the configured/advertised model with the model identifier returned by the upstream response. It records routing evidence from safe metadata headers such as `server`, `via`, `x-provider`, `x-route`, and `x-upstream`, and records no more than a bounded, redacted signal value. It also inspects the bounded probe text for indicators of system/developer instruction leakage or credential-like material. A clean result means no indicators were detected; it is not proof that a hidden prompt does not exist.

The result uses `provisionally_consistent`, `inconsistent`, or `unknown` identity verdicts. An `inconsistent` result is strong evidence that the advertised and reported model differ, but black-box behavior cannot prove which hidden model or proxy is ultimately serving the response. The dashboard therefore presents evidence and confidence rather than claiming certainty.

## Latency interpretation

The audit reports two different measurements. `upstreamLatencyMs` is the network and provider response time for the audit requests. `proxyOverheadMs` is an approximate local difference between the audit duration and upstream request time. The `<1 ms` target applies only to this local proxy-overhead measurement; it cannot be guaranteed for an upstream model request over a network. A single measurement is not a benchmark, so repeated samples and percentile summaries should be used for performance decisions.

## API

`POST /api/gateway/audit` requires the existing dashboard session cookie and accepts `{ "providerId": "custom-api", "model": "optional-model-id" }`. The endpoint can call only a configured, enabled provider with an available authorized API key. The persisted result contains metadata, findings, timing, and evidence only; it sets `storedResponse: false`.

## Operational boundary

This feature is for validating user-owned or explicitly authorized endpoints. It is not a method for bypassing provider authentication, extracting hidden system prompts, impersonating private clients, or conclusively identifying a third party’s backend implementation. A mismatch should be investigated using provider documentation, configuration, and authorized access logs.
