// src/mitm/paths.js
import path from "path";

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".kiro-proxy");
const MITM_DIR = path.join(DATA_DIR, "mitm");
const LOGS_DIR = path.join(DATA_DIR, "logs", "mitm");
const CERT_DIR = path.join(MITM_DIR, "cert");

export {
  DATA_DIR,
  MITM_DIR,
  LOGS_DIR,
  CERT_DIR,
};
