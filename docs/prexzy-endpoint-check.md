# Prexzy endpoint check

Source tested: https://prexzyapis.com/ai/qwen3-5-397b-a17b

Date of check: 2026-08-13.

A bounded unauthenticated GET to the exact URL returned HTTP 404 with `content-type: text/html; charset=UTF-8`, `server: cloudflare`, and `x-powered-by: Express`. The body was an HTML 404 page, not JSON. A single bounded unauthenticated POST containing an OpenAI-shaped request to the exact URL also returned HTTP 404 with the same HTML response class. No API key, cookie, session, or hidden route was used.

Safe interpretation: the supplied URL is not currently an active documented API endpoint at that exact path, so it cannot be converted or verified as a working model backend from this observation. The gateway may recognize the URL pattern `/ai/<model>` and extract `qwen3-5-397b-a17b` as a candidate model ID, but it must require an explicit authenticated live test before saving/routing it and must not claim model identity from the path alone.
