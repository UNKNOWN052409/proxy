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
