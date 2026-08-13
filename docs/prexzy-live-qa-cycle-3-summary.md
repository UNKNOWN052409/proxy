# Prexzy Live QA Cycle 3

Endpoint tested: `https://vip.prexzyapis.com` with the supplied key kept only in the process environment. Raw credentials and raw response bodies were not retained.

## Discovery

Authenticated `/v1/models` returned HTTP 200 and discovered 15 IDs:

| Model IDs |
|---|
| `claude-fable-5`, `claude-fable-5[1m]`, `claude-opus-4-8`, `claude-opus-4-8[1m]`, `claude-opus-5`, `claude-opus-5[1m]`, `claude-sonnet-5`, `claude-sonnet-5[1m]`, `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `glm-5.2`, `gpt-5.6`, `gpt-5.6-sol`, `kimi-k3` |

## Results

| Capability/model | Result |
|---|---|
| Invalid key | PASS, HTTP 401 |
| Supplied key | PASS, HTTP 200 |
| `claude-fable-5` | PASS, HTTP 200 |
| `claude-fable-5[1m]` | PASS, HTTP 200; slower response |
| `claude-opus-4-8` | FAIL, HTTP 402 |
| `claude-opus-4-8[1m]` | PASS, HTTP 200 |
| `claude-opus-5` | PASS, HTTP 200 |
| `claude-opus-5[1m]` | PASS, HTTP 200 |
| `claude-sonnet-5` | PASS, HTTP 200 |
| `claude-sonnet-5[1m]` | PASS, HTTP 200 |
| `gemini-3-pro-image` | BLOCKED, HTTP 502 from upstream/Cloudflare path |
| `gemini-3.1-flash-image` | BLOCKED, HTTP 502 from upstream/Cloudflare path |
| Streaming on `claude-fable-5` | PASS, SSE content type |
| JSON mode on `claude-fable-5` | PASS, HTTP 200 envelope |
| Tools on `claude-fable-5` | BLOCKED in this run, HTTP 502; no actual tool-call emission can be claimed |
| Invalid model | PASS, HTTP 404 with `model_not_found` |
| Malformed JSON | FAIL, HTTP 500; upstream should return clean 4xx validation |
| Approved concurrency | Not run; explicit approval flag remained disabled |

Cycle totals were 12 PASS, 2 FAIL, and 5 BLOCKED. HTTP 200 proves reachability and response compatibility only; it does not prove the hidden backend identity is genuinely the advertised model.
