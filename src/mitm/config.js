// src/mitm/config.js
const IS_DEV = process.env.NODE_ENV !== "production";

const MITM_CONFIG = {
  // Disabled by default: this legacy interception service is not part of the compliant gateway.
  ENABLED: process.env.ENABLE_LEGACY_MITM === "true" && process.env.LEGACY_MITM_ACK === "I_UNDERSTAND_LOCAL_DEBUG_ONLY",

  // Proxy settings
  // WARNING: Port 443 requires administrator/root privileges on most systems
  LOCAL_PORT: 443,
  ROUTER_BASE: process.env.MITM_ROUTER_BASE || "http://localhost:20127",
  API_KEY: process.env.ROUTER_API_KEY || null,

  // Target hosts to intercept
  TARGET_HOSTS: [
    "runtime.us-east-1.kiro.dev",
    "codewhisperer.us-east-1.amazonaws.com",
    "q.us-east-1.amazonaws.com",
  ],

  // SSL/TLS settings
  ENABLE_FILE_LOG: IS_DEV,

  // Host rewrite (avoid rate limits)
  // Empty by default; populate with { "original.host": "rewritten.host" } mappings as needed
  HOST_REWRITE: {},
};

export { MITM_CONFIG, IS_DEV };
