# Safe Feature Completion Cycle

## Implemented in this cycle

The lightweight standalone gateway now supports an opt-in model-refresh scheduler controlled by `GATEWAY_MODEL_REFRESH_SCHEDULER=true`, with bounded intervals, single-flight refresh execution, optional startup refresh, and authenticated dashboard API controls at `/api/gateway/refresh` for status, start, stop, and manual refresh operations. The standalone runtime also accepts authenticated `POST /v1/images/generations` requests and routes them through the existing capability-checked image provider service.

Encrypted gateway credentials now have safe per-credential enable/disable controls. Disabled credentials remain encrypted, appear only as redacted metadata, are excluded from selection, and can be re-enabled without exposing secrets.

## Verification

The maintained safe gateway scope passed 58/58 tests and the production build completed successfully. The full repository run reported 157 passing and 17 failing tests; the failures are concentrated in legacy account-store and tier-detector fixtures that assume the old password/account behavior or shared mutable test state. The safe token-only SQL import boundary was not weakened to satisfy those legacy assumptions.

No `.env` files, API keys, OAuth tokens, private keys, cookies, session material, or generated secrets are tracked by Git. The implementation continues to exclude cookie/session conversion, login interception, free-tier bypass, and undocumented third-party private endpoint capture.

## Runtime flags

Set `GATEWAY_MODEL_REFRESH_SCHEDULER=true` to enable the in-process scheduler in the standalone gateway. `GATEWAY_MODEL_REFRESH_INTERVAL_MS` controls the interval and is clamped between one minute and seven days. Set `GATEWAY_MODEL_REFRESH_ON_START=false` to skip the immediate first refresh. For persistent deployments, use an external process supervisor as well; the scheduler is intentionally lightweight and does not replace service supervision.
