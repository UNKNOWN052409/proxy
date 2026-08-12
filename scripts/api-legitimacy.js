#!/usr/bin/env node
import dns from "node:dns/promises";
import tls from "node:tls";

const baseUrl = String(process.env.LEGITIMACY_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.LEGITIMACY_API_KEY || "");
const model = String(process.env.LEGITIMACY_MODEL || "");
const timeoutMs = Math.max(10_000, Math.min(45_000, Number(process.env.LEGITIMACY_TIMEOUT_MS || 25_000)));

if (!baseUrl) {
  console.error("Set LEGITIMACY_BASE_URL. LEGITIMACY_API_KEY is required for authenticated checks.");
  process.exit(2);
}

function redact(value) {
  return String(value || "").replace(/bearer\s+[a-z0-9._-]+/ig, "Bearer [REDACTED]").replace(/prexzy_[a-z0-9]+/ig, "[REDACTED]").slice(0, 1200);
}
function json(text) { try { return text ? JSON.parse(text) : null; } catch { return null; } }
function safeHeaders(headers) {
  const allow = /^(server|via|date|content-type|content-length|cache-control|age|vary|x-request-id|x-correlation-id|x-powered-by|x-provider|x-route|x-upstream|x-model|cf-ray|cf-cache-status|fly-request-id|x-vercel-id|x-cache|x-cache-status)$/i;
  return Object.fromEntries([...headers.entries()].filter(([key]) => allow.test(key)).map(([key, value]) => [key.toLowerCase(), redact(value)]));
}
async function fetchProbe(url, options = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, url: response.url, redirected: response.redirected, latencyMs: Math.round((performance.now() - started) * 100) / 100, headers: safeHeaders(response.headers), data: json(text), bodyClass: text.toLowerCase().includes("cloudflare") ? "cdn_error_or_page" : response.ok ? "json_or_success" : "error_response", storedBody: false };
  } catch (error) {
    return { ok: false, status: null, url, redirected: false, latencyMs: Math.round((performance.now() - started) * 100) / 100, headers: {}, data: null, bodyClass: error?.name === "AbortError" ? "timeout" : "network_error", error: error?.name === "AbortError" ? "timeout" : "request_failed", storedBody: false };
  } finally { clearTimeout(timer); }
}
async function dnsEvidence(host) {
  try {
    const [addresses, records] = await Promise.all([dns.lookup(host, { all: true }), dns.resolveAny(host).catch(() => [])]);
    return { host, addresses: addresses.map((item) => ({ address: item.address, family: item.family })), recordTypes: [...new Set(records.map((item) => item.type))], error: null };
  } catch (error) { return { host, addresses: [], recordTypes: [], error: error?.code || "dns_failed" }; }
}
function tlsEvidence(host, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate(true);
      const result = { authorized: socket.authorized, authorizationError: socket.authorizationError || null, protocol: socket.getProtocol(), cipher: socket.getCipher()?.name || null, certificate: { subject: cert.subject || null, issuer: cert.issuer || null, validFrom: cert.valid_from || null, validTo: cert.valid_to || null, serialNumber: cert.serialNumber || null, fingerprint256: cert.fingerprint256 || null, subjectAltName: String(cert.subjectaltname || "").slice(0, 1000) }, storedCertificateBody: false };
      socket.end(); resolve(result);
    });
    socket.on("error", (error) => resolve({ authorized: false, authorizationError: error?.code || "tls_failed", certificate: null, storedCertificateBody: false }));
    socket.on("timeout", () => { socket.destroy(); resolve({ authorized: false, authorizationError: "tls_timeout", certificate: null, storedCertificateBody: false }); });
  });
}
function score(report) {
  const evidence = [];
  let points = 0;
  const tlsOk = Boolean(report.tls?.protocol && report.tls?.certificate?.fingerprint256 && !report.tls.authorizationError);
  if (tlsOk) { points += 2; evidence.push({ id: "valid_tls", level: "strong", detail: report.tls.protocol }); }
  else evidence.push({ id: "tls_unverified", level: "warning" });
  if (report.authenticated?.status === 200) { points += 2; evidence.push({ id: "authenticated_contract_responds", level: "strong" }); }
  if (report.unauthenticated?.status === 401 || report.unauthenticated?.status === 403) { points += 2; evidence.push({ id: "auth_boundary_enforced", level: "strong", status: report.unauthenticated.status }); }
  else evidence.push({ id: "auth_boundary_not_proven", level: "warning", status: report.unauthenticated?.status });
  if (report.modelMatch === true) { points += 2; evidence.push({ id: "catalog_contains_requested_model", level: "medium" }); }
  if (report.headers?.server || report.headers?.via || report.headers?.["cf-ray"]) evidence.push({ id: "intermediary_marker", level: "informational", detail: report.headers });
  const verdict = points >= 6 ? "legitimate_contract_evidence" : points >= 3 ? "partially_supported" : "unverified";
  return { points, maxPoints: 8, verdict, evidence, limitation: "Legitimacy evidence does not prove ownership or hidden upstream model identity." };
}

const parsed = new URL(baseUrl);
const origin = `${parsed.protocol}//${parsed.host}`;
const modelsUrl = `${baseUrl}/models`;
const unauthenticated = await fetchProbe(modelsUrl);
const authenticated = apiKey ? await fetchProbe(modelsUrl, { headers: { authorization: `Bearer ${apiKey}` } }) : { status: null, bodyClass: "not_run" };
const badAuth = await fetchProbe(modelsUrl, { headers: { authorization: "Bearer legitimacy-invalid-test" } });
const dnsInfo = await dnsEvidence(parsed.hostname);
const tlsInfo = parsed.protocol === "https:" ? await tlsEvidence(parsed.hostname, Number(parsed.port || 443)) : { authorized: false, authorizationError: "not_https", certificate: null };
const catalog = Array.isArray(authenticated.data?.data) ? authenticated.data.data.map((item) => String(item?.id || "")).filter(Boolean) : [];
const report = {
  checkedAt: new Date().toISOString(),
  endpoint: origin,
  requestedModel: model || null,
  transport: { scheme: parsed.protocol.replace(":", ""), host: parsed.hostname, port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)) },
  dns: dnsInfo,
  tls: tlsInfo,
  headers: authenticated.headers || unauthenticated.headers || {},
  unauthenticated: { status: unauthenticated.status, bodyClass: unauthenticated.bodyClass, latencyMs: unauthenticated.latencyMs },
  invalidCredential: { status: badAuth.status, bodyClass: badAuth.bodyClass, latencyMs: badAuth.latencyMs },
  authenticated: { status: authenticated.status, bodyClass: authenticated.bodyClass, latencyMs: authenticated.latencyMs },
  catalogSample: catalog.slice(0, 50),
  catalogCount: catalog.length,
  modelMatch: model ? catalog.includes(model) : null,
  responseModel: authenticated.data?.model || null,
  providerClaim: authenticated.data?.data?.find?.((item) => item?.id === model)?.owned_by || null,
  storedBodies: false,
};
report.score = score(report);
console.log(JSON.stringify(report, null, 2));
