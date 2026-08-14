# Lightweight public deployment

## Recommended topology

The gateway remains on `127.0.0.1:2018`. A public edge terminates TLS and forwards only to the loopback service:

```text
Phone or client -> HTTPS domain -> NGINX or Cloudflare Tunnel -> 127.0.0.1:2018 -> gateway
```

The standalone gateway baseline uses approximately 59.7 MB RSS in the repository smoke test, leaving headroom under the 100 MB target for the API-only runtime. The full Next.js dashboard is a separate process and should not be assumed to fit under the same 100 MB budget.

## External NGINX

Copy `deploy/nginx/gateway.conf.example` to an NGINX site, replace the hostname and certificate paths, validate with `nginx -t`, and reload NGINX. Keep the gateway bound to loopback. Use an external TLS certificate, rate limiting, and an additional dashboard authentication layer before exposing management pages publicly.

## Cloudflare Tunnel

Copy `deploy/cloudflared/config.yml.example` to the `cloudflared` configuration directory, create a named tunnel, and map the public hostname to `http://127.0.0.1:2018`. The tunnel makes an outbound-only connection, so the origin does not need an inbound public port. The origin machine must remain online.

## Automatic startup and recovery

`deploy/systemd/ai-gateway.service.example` starts the API-only runtime on boot and restarts it after a crash. It does not generate artificial requests to a hosting platform. This is intentional: health checks and crash recovery are safe; synthetic traffic designed to defeat Render Free sleep limits is not.

Install the service after reviewing the `User`, working directory, and secret environment configuration:

```bash
sudo cp deploy/systemd/ai-gateway.service.example /etc/systemd/system/ai-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable --now ai-gateway
curl http://127.0.0.1:2018/health
```

## Render

Render Web Service hosting requires the public Next.js process to bind to `0.0.0.0` and the platform `PORT`. The repository includes `render.yaml` and `/api/health` for this profile. Render Free instances provide low CPU/RAM but sleep after inactivity and use an ephemeral filesystem; they are suitable for testing, not reliable always-on gateway service. Use an always-on paid instance or a VPS when continuous availability is required.

## Phone hosting

A 3 GB RAM phone can run the API-only runtime if it has a stable Node.js-capable environment and remains awake/online. Termux or an equivalent Linux environment can run the gateway, while Cloudflare Tunnel provides public access. Mobile battery optimization, carrier NAT, changing networks, and background-process suspension can still interrupt the service. A VPS is more reliable for 24/7 access.

## No artificial keepalive

The deployment layer does not continuously ping Render or another platform merely to prevent sleep. It can expose `/health` for legitimate monitoring and systemd can restart a failed local process. Continuous availability requires a platform plan that supports always-on operation or infrastructure that is actually kept online.

## Production-readiness acceptance checklist

Use this checklist after the gateway has been placed on a host with the required provider secrets. It distinguishes checks that can be completed from repository code from checks that require a real domain, cloud account, or authorized provider entitlement.

| Area | Required check | Pass condition |
|---|---|---|
| Process boundary | Start the gateway with `npm run gateway` and request `http://127.0.0.1:2018/health`. | The health endpoint returns without exposing provider secrets or request bodies. |
| External exposure | Configure **one** public ingress: a reverse proxy with TLS **or** a named Cloudflare Tunnel. Keep the gateway itself loopback-bound. | HTTPS requests reach the gateway; direct public access to the local port is unavailable. |
| Custom domain | Add the hostname at the selected public ingress and validate the issued TLS certificate from a separate network. | `https://<domain>/health` succeeds and redirects/certificates are expected. |
| Dashboard access | Create a non-admin user and a restricted gateway API key before public use. | The user can view only permitted usage and models; management pages require admin authorization. |
| Provider validation | Use **Test & refresh** and one low-token completion only with an authorized provider credential. | Model discovery and a completion return a documented success response; failures are retained as sanitized status evidence. |
| Scheduled refresh | Schedule the documented model-refresh command no more frequently than operationally needed, such as once daily. | The job uses the deployment secret environment, writes no credentials to logs, and does not generate synthetic keepalive traffic. |
| Health monitoring | Configure external monitoring to call `/health`; let the host service manager restart a failed process. | An outage is detected and restart behavior is visible without issuing artificial model requests. |
| Mobile dashboard | From a real phone or a narrow browser viewport, test login, endpoint copy action, provider status cards, user usage, and account import preview. | No control is clipped, horizontal scrolling is unnecessary except for data tables, and admin-only actions remain hidden from normal users. |
| Resource envelope | Measure the **deployed** API-only process under the intended authorized workload. | RSS and success/error behavior are recorded; do not assume the dashboard process shares the API-only memory result. |

> A temporary public tunnel is useful for testing but is not a production availability guarantee. A named tunnel plus a domain, or an HTTPS reverse proxy on a host that remains online, is required for a stable public endpoint.

## External prerequisites that code cannot supply

The repository can configure and validate the paths above, but it cannot create a provider account, grant image-generation entitlement, register an OAuth client, issue a DNS delegation, or guarantee a host's uptime. Complete these items in the relevant provider or hosting account before marking the corresponding integration production-certified.

| Capability | External prerequisite |
|---|---|
| Provider OAuth and device code | A provider-issued client registration, allowed redirect URI, and an account allowed to grant the documented scopes. |
| API-key/provider verification | A provider-issued key with the requested model entitlement. |
| Image generation | A model and billing/usage entitlement that permits image generation. |
| Multi-provider fallback proof | At least two independently working, authorized upstream providers for the same permitted model class. |
| Custom domain and named tunnel | A domain/DNS zone and access to the selected tunnel or reverse-proxy control plane. |
| 24/7 uptime | A host and hosting plan that remains online; mobile devices and free-tier sleeping hosts do not provide this guarantee. |
