# npm-uniproxy

`npm-uniproxy` is a lightweight, OpenAI-compatible gateway for **authorized provider APIs and user-owned documented endpoints**. It provides encrypted credential storage, tenant API-key policies, provider/model allowlists, bounded concurrency, retry handling, usage attribution, tool bridging, model discovery, image routes, vision fallback, and an optional dashboard.

> **Security boundary:** This project accepts official API keys, documented OAuth/PKCE or device-code flows, service identities, and explicitly authorized documented endpoints. It does not convert browser cookies or private browser sessions into API credentials, capture undocumented web-app endpoints, import passwords/browser profiles, bypass provider controls, or scrape private session material.

## 1. Requirements

For local installation, use **Node.js 20 or newer**, npm, and a writable data directory. Docker users only need Docker. Linux, WSL, Termux, and NetHunter use the same shell commands; Windows uses PowerShell.

## 2. One-line installation

The repository is currently private. After the owner intentionally makes it public, the shortest Linux/WSL/Termux/NetHunter installation is:

```bash
curl -fsSL https://raw.githubusercontent.com/UNKNOWN052409/proxy/complete-gateway/scripts/install.sh | bash
```

The installer downloads a pinned commit, verifies its SHA-256 checksum, installs production dependencies, and creates the `uniproxy` command. It contains no provider keys or user credentials.

The npm package metadata is prepared, but npm publication still requires an authenticated npm owner. Until publication, use the curl installer or a private authenticated installation.

## 3. Private repository installation

For a private repository, keep the token only in the current shell or PowerShell session. Never write it into a script, `.env` file, Dockerfile, commit, or chat message.

On Linux, WSL, Termux, or NetHunter, run the private installer from a trusted checkout or internal artifact location:

```bash
export GITHUB_TOKEN='token-for-this-shell-only'
bash scripts/install-private.sh
unset GITHUB_TOKEN
```

On Windows PowerShell:

```powershell
$env:GITHUB_TOKEN = 'token-for-this-session-only'
& .\scripts\install-private.ps1
Remove-Item Env:GITHUB_TOKEN
```

## 4. Start locally

The gateway uses loopback port `2018` by default and automatically selects the next available port when that port is busy.

```bash
uniproxy
```

For a checked-out development copy:

```bash
npm ci
npm run dev
```

The standalone gateway can also be started with:

```bash
npm run gateway
```

The local health endpoint is:

```text
http://127.0.0.1:2018/health
```

## 5. Configure the gateway

Use environment variables or the dashboard configuration. A minimal local configuration is:

```bash
export GATEWAY_HOST=127.0.0.1
export GATEWAY_PORT=2018
export GATEWAY_UPSTREAM_TIMEOUT_MS=15000
export GATEWAY_MAX_CONCURRENCY=12
export GATEWAY_MAX_QUEUE_SIZE=96
```

The upstream deadline is bounded and configurable; the retry delay remains five seconds. Keep LAN binding disabled unless an authenticated reverse proxy or private tunnel is already configured.

Credential and tenant data are stored in the configured encrypted SQLite data directory. Production deployments must mount persistent storage; an ephemeral filesystem can lose credentials and usage records after restart or redeploy.

## 6. Use the OpenAI-compatible API

The gateway requires a gateway API key for `/v1/*` routes. Replace placeholders locally; do not paste real credentials into source files.

List models:

```bash
curl http://127.0.0.1:2018/v1/models \
  -H 'Authorization: Bearer YOUR_GATEWAY_KEY'
```

Send a chat completion:

```bash
curl http://127.0.0.1:2018/v1/chat/completions \
  -H 'Authorization: Bearer YOUR_GATEWAY_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"Hello"}]}'
```

The main compatible routes are `GET /v1/models`, `POST /v1/chat/completions`, and `POST /v1/images/generations`. Streaming uses the normal OpenAI `stream: true` request field.

## 7. Docker

Build from a trusted checkout:

```bash
docker build -t npm-uniproxy:private .
docker run --rm --name npm-uniproxy \
  -p 2018:2018 \
  --env-file .env \
  -v uniproxy-data:/app/data \
  npm-uniproxy:private
```

The Docker build excludes local databases, credentials, coverage, `.env` files, and development artifacts through `.dockerignore`. Use a persistent volume or external storage for production data.

## 8. Dashboard and deployment

Run the dashboard from a project copy with:

```bash
npm run build
npm start
```

For Render, use the repository’s `render.yaml`, configure the required environment values in the Render dashboard, and attach persistent storage for SQLite data. Render’s public HTTPS URL can be used directly; a Cloudflare Tunnel is not required there. For a VPS, place an authenticated HTTPS reverse proxy or named tunnel in front of the loopback gateway. Detailed checklists are in [`docs/GATEWAY.md`](docs/GATEWAY.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 9. CI/CD

The private-safe workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes, pull requests, and manual dispatch. It performs the serial test suite, production build, installer syntax checks, secret-shaped content scanning, npm package-boundary inspection, and Docker build validation. It does not publish credentials, databases, or an npm package automatically.

Run the same core checks locally:

```bash
npm test
npm run build
bash -n scripts/install.sh
bash -n scripts/install-private.sh
npm pack --dry-run
```

## 10. Branch policy

`complete-gateway` is the consolidated implementation branch. The local `master` and `feat/compliant-gateway` branches contain no commits that are absent from it. The remote `main` history is intentionally not merged because it contains a divergent cookie-conversion and session-oriented implementation that does not match this project’s safe authorization boundary.

## 11. Troubleshooting

If `uniproxy` is not found, add `$HOME/.local/bin` to `PATH` and open a new shell. If port `2018` is busy, the gateway selects the next available port; check the startup output for the actual port. If models are visible but chat returns `401`, `402`, `429`, `502`, or `504`, inspect the configured provider credential, entitlement, rate limit, and upstream availability; model-list visibility alone is not proof of successful completion capability. If data disappears after deployment, configure persistent storage before importing credentials or issuing tenant keys.

## 12. Development and verification

```bash
npm ci
npm test
npm run coverage:all
npm run build
```

The verified repository suite currently passes all regression tests. Coverage is tracked separately from test pass/fail status and is not claimed as 100% unless the coverage report reaches that level.

## 13. Rev engine (Rust, `engine/`)

`revd` is a small Rust OpenAI-compatible `/v1` server with a pluggable adapter registry. Adapters are single-account, user-owned-session replay implementations (the operator's own credentials and captured flows); the registry ships an echo adapter plus optional Qwen, DeepSeek, and generic captured-flow adapters loaded from config directories.

- Adapter trait: `engine/src/main.rs` — `chat` / `chat_stream`, SQLite usage log, `sk-fabri-` key system
- Qwen adapter: `engine/src/qwen.rs` — web-session flow (warmup GET, chats/new, SSE completions), ported from the Python QwenConnector
- DeepSeek adapter: `engine/src/deepseek.rs` — proof-of-work handshake plus SSE
- GenericFlow adapter: `engine/src/generic_flow.rs` — replays any user-captured flow config (`FLOW_CONFIG_DIR`), JSON or SSE, multi-app `apps` array supported
- Model-alias routing: requests address adapters by name (`qwen`) or by model id (`qwen3.8-max`, flow names)
- Token efficiency: request fields `max_tokens` and `batch` — one request, maximum output; a full-output directive is injected by default even without `max_tokens` (`render_prompt_full`)

The Python serving layer (`rev-serving/universal_server.py`) accepts the same `max_tokens`/`batch` fields for every connector, keeping behavior consistent between the Rust engine and the Python bridge.

## References

[1]: https://nodejs.org/en/download Node.js downloads and supported runtime versions.
[2]: https://docs.npmjs.com/cli/v10/commands/npm-pack npm package boundary inspection.
[3]: https://docs.github.com/en/actions GitHub Actions workflow documentation.
[4]: https://docs.docker.com/build/ Docker image build documentation.
[5]: https://render.com/docs Render deployment documentation.
