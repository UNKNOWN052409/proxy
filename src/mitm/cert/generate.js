// src/mitm/cert/generate.js
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CERT_DIR, MITM_DIR } from "../paths.js";

const CA_KEY_PATH = path.join(MITM_DIR, "rootCA.key");
const CA_CERT_PATH = path.join(MITM_DIR, "rootCA.crt");

// Certificate cache (in-memory for performance) with LRU eviction
const MAX_CACHE_SIZE = 1000;
const certCache = new Map();

/**
 * Ensure certificate directories exist
 */
function ensureCertDir() {
  if (!fs.existsSync(MITM_DIR)) {
    fs.mkdirSync(MITM_DIR, { recursive: true });
  }
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }
}

/**
 * Generate a self-signed Root CA certificate using OpenSSL
 * This CA will be used to sign domain-specific certificates
 */
function generateRootCA() {
  ensureCertDir();

  // Check if CA already exists
  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
    console.log("Root CA already exists, skipping generation");
    return loadRootCA();
  }

  console.log("Generating Root CA certificate...");

  try {
    // Generate CA private key (2048-bit RSA)
    execSync(
      `openssl genrsa -out "${CA_KEY_PATH}" 2048`,
      { stdio: "pipe" }
    );

    // Generate self-signed CA certificate (valid for 10 years)
    execSync(
      `openssl req -new -x509 -days 3650 -key "${CA_KEY_PATH}" -out "${CA_CERT_PATH}" ` +
      `-subj "/C=US/O=Kiro/CN=Kiro MITM Proxy CA"`,
      { stdio: "pipe" }
    );

    console.log("Root CA generated successfully");
    console.log(`CA Certificate: ${CA_CERT_PATH}`);
    console.log(`CA Key: ${CA_KEY_PATH}`);

    return loadRootCA();
  } catch (error) {
    console.error("Failed to generate Root CA:", error.message);
    throw error;
  }
}

/**
 * Load existing Root CA from disk
 */
function loadRootCA() {
  if (!fs.existsSync(CA_KEY_PATH) || !fs.existsSync(CA_CERT_PATH)) {
    throw new Error("Root CA not found. Run generateRootCA() first.");
  }

  const key = fs.readFileSync(CA_KEY_PATH, "utf8");
  const cert = fs.readFileSync(CA_CERT_PATH, "utf8");

  return { key, cert };
}

/**
 * Generate a leaf certificate for a specific domain, signed by the Root CA
 * Uses OpenSSL to create proper X.509 certificates
 */
function generateLeafCert(domain, rootCA) {
  // Check memory cache first
  const cacheKey = domain;
  if (certCache.has(cacheKey)) {
    const cached = certCache.get(cacheKey);
    // Move to end for LRU (re-insert)
    certCache.delete(cacheKey);
    certCache.set(cacheKey, cached);
    return cached;
  }

  // Check disk cache
  const safeDomain = sanitizeDomain(domain);
  const certPath = path.join(CERT_DIR, `${safeDomain}.crt`);
  const keyPath = path.join(CERT_DIR, `${safeDomain}.key`);

  // Validate paths are within CERT_DIR (prevent path traversal)
  if (!validatePathInDirectory(certPath, CERT_DIR) || !validatePathInDirectory(keyPath, CERT_DIR)) {
    throw new Error(`Invalid domain name: path traversal detected for ${domain}`);
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    // Check if certificate is still valid (not expired)
    if (!isCertificateValid(certPath)) {
      console.warn(`Cached certificate for ${domain} is expired, regenerating`);
    } else {
      try {
        const cert = fs.readFileSync(certPath, "utf8");
        const key = fs.readFileSync(keyPath, "utf8");
        const cached = { key, cert };
        // Apply LRU eviction before caching
        evictOldestCacheEntry();
        certCache.set(cacheKey, cached);
        return cached;
      } catch (err) {
        console.warn(`Invalid cert cache for ${domain}, regenerating`);
      }
    }
  }

  // Generate new certificate using OpenSSL
  const tempDir = path.join(CERT_DIR, `temp_${safeDomain}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const tempKeyPath = path.join(tempDir, "key.pem");
    const csrPath = path.join(tempDir, "csr.pem");
    const tempCertPath = path.join(tempDir, "cert.pem");
    const extPath = path.join(tempDir, "ext.cnf");

    // Generate private key for the domain
    execSync(`openssl genrsa -out "${tempKeyPath}" 2048`, { stdio: "pipe" });

    // Escape domain for safe use in shell commands (prevent command injection)
    const escapedDomain = escapeDomainForShell(domain);

    // Create certificate signing request (CSR)
    execSync(
      `openssl req -new -key "${tempKeyPath}" -out "${csrPath}" ` +
      `-subj "/C=US/O=Kiro Proxy/CN=${escapedDomain}"`,
      { stdio: "pipe" }
    );

    // Create extension config for SAN (Subject Alternative Name)
    // Use escaped domain to prevent command injection in certificate extensions
    const extConfig = [
      "subjectAltName = @alt_names",
      "basicConstraints = CA:FALSE",
      "keyUsage = digitalSignature, keyEncipherment",
      "extendedKeyUsage = serverAuth, clientAuth",
      "",
      "[alt_names]",
      `DNS.1 = ${escapedDomain}`,
      `DNS.2 = *.${escapedDomain}`
    ].join("\n");

    fs.writeFileSync(extPath, extConfig, "utf8");

    // Sign the certificate with our CA
    execSync(
      `openssl x509 -req -in "${csrPath}" -CA "${CA_CERT_PATH}" -CAkey "${CA_KEY_PATH}" ` +
      `-CAcreateserial -out "${tempCertPath}" -days 365 -sha256 -extfile "${extPath}"`,
      { stdio: "pipe" }
    );

    // Read generated key and certificate
    const key = fs.readFileSync(tempKeyPath, "utf8");
    const cert = fs.readFileSync(tempCertPath, "utf8");

    const leafCert = { key, cert };

    // Apply LRU eviction before adding to cache
    evictOldestCacheEntry();

    // Cache in memory and save to disk as separate files
    certCache.set(cacheKey, leafCert);
    fs.writeFileSync(keyPath, key, "utf8");
    fs.writeFileSync(certPath, cert, "utf8");

    // Set restrictive permissions on private key file (owner-only read/write)
    fs.chmodSync(keyPath, 0o600);

    return leafCert;
  } catch (error) {
    console.error(`Failed to generate certificate for ${domain}:`, error.message);
    throw error;
  } finally {
    // Clean up temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`Failed to cleanup temp dir ${tempDir}:`, cleanupErr.message);
    }
  }
}

/**
 * Escape domain string for safe use in shell commands
 * Prevents command injection by escaping special shell characters
 */
function escapeDomainForShell(domain) {
  // Remove any characters that could be used for command injection
  // Only allow alphanumeric, dots, hyphens, and underscores
  return domain.replace(/[^a-zA-Z0-9.-]/g, "");
}

/**
 * Sanitize domain name for use in filenames
 */
function sanitizeDomain(domain) {
  return domain.replace(/[^a-zA-Z0-9.-]/g, "_");
}

/**
 * Validate that a path is within the expected directory
 * Prevents path traversal attacks
 */
function validatePathInDirectory(filePath, expectedDir) {
  const normalized = path.normalize(filePath);
  const normalizedDir = path.normalize(expectedDir);
  return normalized.startsWith(normalizedDir);
}

/**
 * Check if a certificate is expired or expiring soon
 * Returns true if the certificate is valid (not expired)
 */
function isCertificateValid(certPath) {
  try {
    if (!fs.existsSync(certPath)) {
      return false;
    }

    // Use OpenSSL to check certificate expiration
    const result = execSync(
      `openssl x509 -in "${certPath}" -noout -checkend 86400`,
      { stdio: "pipe" }
    );
    // checkend returns 0 if cert will not expire within the specified time
    return true;
  } catch (error) {
    // Certificate is expired or will expire soon (within 24 hours)
    return false;
  }
}

/**
 * Implement LRU cache eviction when cache exceeds MAX_CACHE_SIZE
 */
function evictOldestCacheEntry() {
  if (certCache.size >= MAX_CACHE_SIZE) {
    // Map maintains insertion order, so first key is oldest
    const oldestKey = certCache.keys().next().value;
    certCache.delete(oldestKey);
  }
}

/**
 * Generate Root CA certificate (one-time setup)
 * This is the main entry point for certificate setup
 */
export { generateRootCA };

/**
 * Get certificate for a specific domain (dynamic generation)
 * Used by SNICallback in HTTPS server
 */
export function getCertForDomain(domain) {
  try {
    const rootCA = loadRootCA();
    const leafCert = generateLeafCert(domain, rootCA);
    return {
      key: leafCert.key,
      cert: leafCert.cert
    };
  } catch (error) {
    console.error(`Failed to generate cert for ${domain}:`, error.message);
    return null;
  }
}

/**
 * Clear certificate cache (useful for testing)
 */
export function clearCertCache() {
  certCache.clear();
  if (fs.existsSync(CERT_DIR)) {
    const files = fs.readdirSync(CERT_DIR);
    for (const file of files) {
      // Only delete certificate and key files, not directories or other files
      if (file.endsWith('.crt') || file.endsWith('.key')) {
        const filePath = path.join(CERT_DIR, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
}

/**
 * Get Root CA certificate path (for installing in system trust store)
 */
export function getRootCACertPath() {
  return CA_CERT_PATH;
}
