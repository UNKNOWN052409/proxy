# Cloudflare Quick Tunnel notes

Sources:

- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/

Cloudflare documents TryCloudflare quick tunnels for testing and development. The command is `cloudflared tunnel --url http://localhost:8080`; it creates a random `trycloudflare.com` subdomain. The documentation states that quick tunnels have no SLA, are not for production, have a current 200 in-flight request limit, and do not support Server-Sent Events (SSE). The official amd64 binary link is https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.
