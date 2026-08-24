import crypto from "node:crypto";
import { mistake } from "../client/config_guard.mjs";

const COMPARE_KEY = crypto.randomBytes(32);

const WEAK_SECRETS = new Set([
  "password",
  "passwordpassword",
  "secret",
  "secretkey",
  "master-key",
  "master_key",
  "flash_console_default_key",
  "1234567890123456",
  "changeme",
  "admin",
]);

const PUBLIC_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

export function isTestRuntime() {
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

export function minSecretBytes() {
  return isTestRuntime() ? 8 : 16;
}

export function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHmac("sha256", COMPARE_KEY).update(a).digest();
  const hashB = crypto.createHmac("sha256", COMPARE_KEY).update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function secretByteLength(value) {
  if (Buffer.isBuffer(value)) return value.length;
  return Buffer.byteLength(String(value), "utf8");
}

export function collectSecretMistakes(value, keyName = "secretKey") {
  const mistakes = [];
  if (value == null || value === "") {
    mistakes.push(mistake(`${keyName} is required`, keyName));
    return mistakes;
  }
  const len = secretByteLength(value);
  const min = minSecretBytes();
  if (len < min) {
    mistakes.push(
      mistake(
        `${keyName} must be at least ${min} bytes (use a long random passphrase)`,
        keyName,
      ),
    );
  }
  const normalized = String(value).trim().toLowerCase();
  if (
    WEAK_SECRETS.has(normalized) ||
    WEAK_SECRETS.has(normalized.replace(/[^a-z0-9]/g, ""))
  ) {
    mistakes.push(
      mistake(
        `${keyName} is too weak; choose a unique high-entropy secret`,
        keyName,
      ),
    );
  }
  return mistakes;
}

export function assertStrongSecret(value, keyName = "secretKey") {
  const mistakes = collectSecretMistakes(value, keyName);
  if (mistakes.length) throw mistakes[0];
}

export function assertAuthSecret(value, keyName = "authKey") {
  assertStrongSecret(value, keyName);
}

export function assertLocalOrExplicitPublicBind(host, { allowPublicBind, authKey }) {
  const bound = host || "127.0.0.1";
  if (!PUBLIC_HOSTS.has(bound)) return;
  if (!allowPublicBind) {
    throw mistake(
      `host ${bound} requires allowPublicBind: true (and a strong authKey)`,
      "host",
    );
  }
  if (!authKey) {
    throw mistake("public bind requires authKey", "authKey");
  }
}

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function createIpRateLimiter({ windowMs = 10_000, max = 200 } = {}) {
  const hits = new Map();
  let checks = 0;
  return (ip) => {
    const now = Date.now();
    checks += 1;
    if (checks % 256 === 0 && hits.size > 512) {
      for (const [k, bucket] of hits) {
        if (now - bucket.start >= windowMs) hits.delete(k);
      }
    }
    const key = ip || "unknown";
    const bucket = hits.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}

export function clientIp(req) {
  return req.socket?.remoteAddress || "unknown";
}
