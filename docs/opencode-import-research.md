# OpenCode import research

Sources:
- https://opencode.ai/docs/providers/
- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/config/
- https://github.com/anomalyco/opencode

Verified findings:
- OpenCode supports 75+ providers through AI SDK and Models.dev.
- Provider API keys entered through `/connect` are stored by OpenCode in `~/.local/share/opencode/auth.json`.
- OpenCode config supports provider IDs, custom `baseURL`, model allowlists/blacklists, custom provider names, and model maps.
- `opencode auth list` lists authenticated providers; `opencode auth logout` removes credentials.
- OpenCode supports OAuth for some provider login methods, but provider-specific terms apply. Official docs explicitly state that Claude Pro/Max plugins are prohibited by Anthropic; browser/subscription OAuth or local session state must not be imported into this gateway as a generic credential.
- OpenCode also supports API-key connection for many providers, custom OpenAI-compatible endpoints, and local endpoints. Safe gateway import should accept provider-issued API keys, explicit base URLs, model IDs, and documented metadata—not copy `auth.json` wholesale or import private session tokens.
- OpenCode repository is MIT licensed and is not affiliated with this gateway.
- OpenCode `serve`/`web` can expose an HTTP server; any remote use must be explicitly authorized and protected with authentication. This gateway should not silently connect to arbitrary OpenCode servers.

Implementation implication: add an OpenCode-compatible import option that accepts a user-supplied exported configuration containing provider ID, display name, base URL, API-key reference/value through encrypted import, model IDs, and optional prefix. Provide a separate manual OAuth/API credential path only for officially documented provider flows; do not import browser/session files or subscription tokens.

Saved on 2026-08-13.

## VPS egress requirement
A server-side reverse proxy normally makes upstream connections from the gateway host's egress IP. The gateway must avoid forwarding client IP headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`) unless explicitly required by an authorized upstream. Deployment docs should configure NGINX/Cloudflare/Tunnel so the public client connects to the gateway, while provider-facing requests originate from the VPS. This is routing/privacy behavior, not a guarantee of geographic identity; actual upstream-visible egress must be verified from the deployed VPS.
