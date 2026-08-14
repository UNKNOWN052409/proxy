# npm-uniproxy

`npm-uniproxy` is a lightweight OpenAI-compatible AI gateway for authorized provider APIs and user-owned endpoints. It provides encrypted credential storage, provider/model routing, tenant API-key policies, retries, bounded concurrency, usage attribution, tool bridging, model discovery, and optional dashboard deployment.

## Install

```bash
npm install -g npm-uniproxy
```

## Start the API gateway

The standalone runtime binds to loopback port `2018` by default and automatically tries the next available port when that port is occupied.

```bash
uniproxy
```

The public-compatible routes are:

```text
GET  /health
GET  /v1/models
POST /v1/chat/completions
POST /v1/images/generations
```

The gateway requires a valid Bearer API key for `/v1/*` routes. Keep the process on loopback unless an authenticated reverse proxy or tunnel is configured in front of it. To deliberately bind to a LAN interface, set `GATEWAY_ALLOW_LAN=true` and review the security configuration first.

## Configuration

Useful runtime settings include:

```bash
GATEWAY_PORT=2018
GATEWAY_HOST=127.0.0.1
GATEWAY_UPSTREAM_TIMEOUT_MS=15000
GATEWAY_MAX_CONCURRENCY=12
GATEWAY_MAX_QUEUE_SIZE=96
```

Credential and tenant data are stored under the current working directory's `data/` directory and protected by the gateway's encrypted storage configuration. Use a persistent volume in production. Do not commit environment files, database files, API keys, OAuth tokens, browser cookies, or session exports.

## Private cross-platform installation

This repository is private by default. The authenticated installers download a pinned GitHub commit through the GitHub API, verify its SHA-256 archive checksum, install production dependencies, and create a local launcher. They never store or print the GitHub token.

On Linux, Termux, or NetHunter, create the token only in the current shell and run the installer from a trusted checkout or internal artifact location:

```bash
export GITHUB_TOKEN='your-token-in-the-current-shell-only'
bash scripts/install-private.sh
unset GITHUB_TOKEN
```

On Windows PowerShell:

```powershell
$env:GITHUB_TOKEN = 'your-token-in-the-current-session-only'
& .\\scripts\\install-private.ps1
Remove-Item Env:GITHUB_TOKEN
```

For Docker, build from an authenticated local checkout; the token is not passed into the image:

```bash
docker build -t npm-uniproxy:private .
docker run --rm -p 2018:2018 --env-file .env npm-uniproxy:private
```

The same installers work in ordinary Linux, WSL, Termux, and NetHunter as long as Node.js 20+, npm, curl, tar, and a writable home directory are available. Private npm publication is not required for these paths.

## Dashboard and deployment

The full dashboard can be run from a checked-out project copy with `npm run dev` or `npm run build && npm start`. For public deployment, use an HTTPS reverse proxy or a named tunnel that forwards to the loopback gateway. See [`docs/GATEWAY.md`](docs/GATEWAY.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Supported authentication boundary

This package is intended for official API keys, documented OAuth/PKCE or device-code flows, service identities, and explicitly authorized documented endpoints. It does not convert browser cookies or private browser sessions into API credentials, capture undocumented web-app endpoints, bypass provider access controls, or import passwords/browser profiles.

## Development

```bash
npm install
npm test
npm run build
npm run gateway
```

The project uses Node.js 20 or newer. The package is published as `UNLICENSED`; confirm the licensing and attribution requirements for your intended distribution before publishing it publicly.
