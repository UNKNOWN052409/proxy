# Local runtime design

The local runtime keeps the public gateway bound to loopback by default and prefers port `2018`. If the preferred port is occupied, the runtime selects the next available port in the configured range and prints the actual URL. The full Next application and the API-only gateway use the same selection behavior.

## Authorized credentials

Provider credentials are accepted only as explicitly supplied API keys or officially issued OAuth access tokens. Browser cookies, passwords, session identifiers, and private client tokens are rejected. Imported secrets are encrypted with AES-256-GCM and stored in a user-local file with restrictive permissions. The encryption master key is supplied by `GATEWAY_CREDENTIAL_MASTER_KEY`; it is never written into the credential file.

A provider can have multiple authorized credentials. Selection skips credentials in cooldown, prefers the least recently used healthy credential, and records success/failure metadata without storing secret values in logs. HTTP 401/403 failures put a credential into cooldown; successful requests clear the failure counter. This is failover for user-owned credentials, not third-party account or session pooling.

## Local adapters

OpenAI-compatible providers may use loopback HTTP URLs such as `http://127.0.0.1:11434/v1` or a user-approved private address. Non-loopback provider URLs must use HTTPS. No-auth upstream access is never exposed as public gateway access: the gateway itself still requires a gateway Bearer key, even when the upstream is local and unauthenticated.

## Port variables

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `2018` | Preferred port for the full Next application. |
| `GATEWAY_PORT` | `2018` | Preferred port for the API-only gateway. |
| `PORT_FALLBACK_MAX_ATTEMPTS` | `20` | Number of sequential ports to try after the preferred port. |
| `GATEWAY_HOST` | `127.0.0.1` | Bind address for the API-only gateway. |
| `GATEWAY_CREDENTIAL_MASTER_KEY` | unset | Required to import encrypted provider credentials. Use a 32-byte hex or base64 value. |

## Management API protection

Provider configuration, encrypted credential import, enable/disable controls, and model refresh actions require the existing `kp-auth=authenticated` dashboard session. The public OpenAI-compatible gateway still uses its own generated Bearer API keys. Read-only status data does not include secret values.

The gateway may rotate only explicitly imported API keys or official access tokens. A failed 401, 403, 429, or repeated upstream failure places that credential into a short cooldown; the selector then chooses another ready credential when available. No cookie, password, browser session, or private desktop-client token is stored or selected.
