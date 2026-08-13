# SQL Storage and Import/Export Implementation Report

## Scope

The gateway now uses a shared SQLite database at `~/.kiro-proxy/gateway.db` by default. The path can be overridden with `GATEWAY_SQLITE_PATH`, while `GATEWAY_DATA_DIR` controls the default data directory. SQLite is configured with WAL mode, a five-second busy timeout, and foreign-key enforcement.

## Storage changes

The new `src/lib/storage/sql-store.js` module creates `schema_meta`, `kv_store`, and `oauth_accounts` tables. Dashboard configuration and gateway runtime state are persisted through the `kv_store` namespace interface. Provider/OAuth account records use the `oauth_accounts` table with indexes for provider and active status. Existing `~/.kiro-proxy/config.json` data is migrated once into the SQL `config` namespace; the JSON file is not used for subsequent reads or writes.

Access and refresh tokens are encrypted with AES-256-GCM before being written to SQLite. The key is supplied by `GATEWAY_CREDENTIAL_MASTER_KEY` and must decode to exactly 32 bytes. The application refuses encrypted credential operations when the key is missing instead of silently storing plaintext. Account metadata exports exclude secrets.

## Import/export behavior

| Flow | Endpoint | Result |
|---|---|---|
| Account import | `POST /api/accounts/import` | Accepts JSON or multipart JSON files up to 5 MB; imports explicit API/OAuth tokens only; rejects cookies, passwords, session material, and private headers. |
| Account metadata export | `GET /api/accounts/export` | Downloads a secret-free metadata file. |
| 9Router-compatible account export | `GET /api/accounts/export?format=9router` | Downloads a token-free connection metadata structure; secrets are intentionally excluded. |
| Gateway configuration export | `GET /api/gateway/config` | Downloads provider metadata, model catalogs, health, and audit state without credentials. |
| Gateway configuration import | `POST /api/gateway/config` | Merges provider metadata and model catalogs into the SQL-backed runtime store. |

All account and gateway configuration operations require the existing admin role guard. The dashboard Gateway page now includes **Export SQL config** and **Import SQL config** controls. Account export/import controls remain available through the existing Accounts dashboard.

## Verification

The production build completed successfully and registered the new `/api/gateway/config`, `/api/accounts/import`, and `/api/accounts/export` routes. The gateway suite passed **34/34** tests. An isolated SQLite integration check passed encrypted token round-trip, secret-free export, configuration persistence, and plaintext-at-rest assertions.

The build reports only pre-existing/dependency-level warnings: the middleware convention deprecation, SQLite experimental-feature warnings in Node 22, and a dynamic filesystem tracing warning from the existing tunnel route. These warnings did not prevent compilation or route generation.

## Safety boundary

This implementation does not add cookie scraping, browser-session conversion, login MITM, undocumented private endpoint capture, password import, free-tier bypass, or arbitrary tool execution. Import accepts only explicitly supplied API keys or official OAuth token fields and stores them encrypted.
