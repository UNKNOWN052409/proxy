# Multi-tenant API platform

The gateway now has a role-aware platform foundation. The administrator can create and disable users, assign provider and model allowlists, view all users and keys, and manage provider/account configuration. A normal user can authenticate, view only their own keys, and create API keys only inside the provider/model scope assigned by an administrator.

## Roles

| Role | Permissions |
|---|---|
| Admin | Manage users, scopes, provider settings, account pools, model catalogs, audits, domains, and all API keys. |
| User | View their own keys, create scoped keys, use assigned models/providers, and request a domain connection. |

API keys remain hashed at rest. Their owner, provider IDs, and model IDs are stored as metadata. Every OpenAI-compatible chat request checks the key scope before upstream execution. An empty allowlist means no restriction for an administrator-created key; a user cannot self-expand an assigned allowlist.

## First login

The existing dashboard password login creates the initial local administrator session. Set `PLATFORM_SESSION_SECRET` or `GATEWAY_SESSION_SECRET` in production. The platform login endpoint is `/api/platform/auth/login`. Do not use a default password on a public deployment.

## Domain connect

The mobile-friendly page is `/dashboard/connect`. It accepts a hostname, validates the domain syntax, and returns explicit DNS/TXT verification instructions. It does not silently modify DNS records or claim that a domain is connected before the operator configures NGINX, Cloudflare Tunnel, Render, or another edge service.

The supplied deployment templates remain available under `deploy/nginx`, `deploy/cloudflared`, and `deploy/systemd`. For 24/7 service, use an always-on VPS, phone/server that remains online, or an always-on hosted instance. Render Free sleep cannot be defeated safely with artificial keepalive traffic.

## Platform limits

The current implementation is a safe foundation rather than a hosted identity provider. Session management is local and signed, and provider/account data remains installation-owned. A production SaaS deployment should use a persistent managed database, a secret manager, HTTPS-only cookies, rate limiting, audit logs, and a dedicated identity provider before serving untrusted tenants at scale.
