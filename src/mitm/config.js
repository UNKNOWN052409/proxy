// src/mitm/config.js
const IS_DEV = process.env.NODE_ENV !== "production";

function isLoopbackHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1";
}

function localTargets() {
  return String(process.env.MITM_LOCAL_TARGETS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter(isLoopbackHost)
    .slice(0, 16);
}

const TARGET_HOSTS = localTargets();

const MITM_CONFIG = {
  // This retired compatibility component is disabled unless an administrator
  // explicitly enables it for loopback-only traffic they own and control.
  ENABLED: process.env.ENABLE_LEGACY_MITM === "true"
    && process.env.LEGACY_MITM_ACK === "I_UNDERSTAND_LOCAL_DEBUG_ONLY"
    && TARGET_HOSTS.length > 0,

  // Port 443 requires administrator/root privileges on most systems.
  LOCAL_PORT: 443,
  ROUTER_BASE: process.env.MITM_ROUTER_BASE || "http://localhost:2018",
  API_KEY: process.env.ROUTER_API_KEY || null,

  // Only localhost / .localhost / loopback IPs supplied by the administrator.
  // Third-party provider domains, browser sessions, cookies, and private
  // headers are intentionally outside the supported gateway boundary.
  TARGET_HOSTS,

  ENABLE_FILE_LOG: IS_DEV,
  HOST_REWRITE: {},
};

export { MITM_CONFIG, IS_DEV, isLoopbackHost, localTargets };
