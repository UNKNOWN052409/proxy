// src/mitm/logger.js
import fs from "fs";
import path from "path";
import { LOGS_DIR } from "./paths.js";

const IS_DEV = process.env.NODE_ENV !== "production";

function ensureLogDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function formatTimestamp() {
  return new Date().toISOString();
}

// log() writes to file only in dev to reduce I/O overhead in production
// err() always writes to file since errors should be persisted regardless of environment
function log(msg) {
  const timestamp = formatTimestamp();
  const line = `[${timestamp}] ${msg}\n`;
  console.log(line.trim());

  if (IS_DEV) {
    ensureLogDir();
    try {
      fs.appendFileSync(path.join(LOGS_DIR, "mitm.log"), line);
    } catch (e) {
      console.error("Failed to write log file:", e.message);
    }
  }
}

function err(msg) {
  const timestamp = formatTimestamp();
  const line = `[${timestamp}] ERROR: ${msg}\n`;
  console.error(line.trim());

  ensureLogDir();
  try {
    fs.appendFileSync(path.join(LOGS_DIR, "mitm-error.log"), line);
  } catch (e) {
    console.error("Failed to write error log file:", e.message);
  }
}

function clearDumpDir() {
  const dumpDir = path.join(LOGS_DIR, "dumps");
  if (fs.existsSync(dumpDir)) {
    try {
      const files = fs.readdirSync(dumpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(dumpDir, file));
      }
    } catch (e) {
      console.error("Failed to clear dump directory:", e.message);
    }
  }
}

export { log, err, clearDumpDir, IS_DEV };
