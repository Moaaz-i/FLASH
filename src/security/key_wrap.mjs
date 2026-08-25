import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FlashCipher } from "../crypto/cipher.mjs";
import { assertStrongSecret } from "./trust_guard.mjs";
import { mistake } from "../client/config_guard.mjs";
import { reportError } from "../core/report_error.mjs";

export const FLASH_WRAP_FILENAME = ".flash-wrap";
export const FLASH_TAKE_FILENAME = ".flash-take";
export const FLASH_TAKE_MAGIC = "FLASHTAKE1";
const WRAP_SALT = "flash-key-wrap-v1";

/**
 * Strong random wrap / master secret (passphrase-shaped, high entropy).
 * @param {string} [prefix='flash_wrap']
 * @returns {string}
 */
export function generateFlashSecret(prefix = "flash_wrap") {
  const body = crypto.randomBytes(32).toString("base64url");
  return `${prefix}_${body}`;
}

/**
 * Seal a master secretKey under a wrap key.
 * @param {string} secretKey
 * @param {string} wrapKey
 * @returns {string} file body for .flash-take
 */
export function sealSecretKey(secretKey, wrapKey) {
  assertStrongSecret(secretKey, "secretKey");
  assertStrongSecret(wrapKey, "wrapKey");
  const cipher = new FlashCipher(wrapKey, WRAP_SALT);
  const payload = cipher.encrypt(secretKey, {
    aad: "flash-take:secretKey",
  });
  return `${FLASH_TAKE_MAGIC}\n${payload}\n`;
}

/**
 * @param {string} takeBody
 * @param {string} wrapKey
 * @returns {string}
 */
export function unsealSecretKey(takeBody, wrapKey) {
  assertStrongSecret(wrapKey, "wrapKey");
  const text = String(takeBody || "").trim();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines[0] !== FLASH_TAKE_MAGIC || !lines[1]) {
    throw reportError(
      mistake(
        `${FLASH_TAKE_FILENAME} must start with ${FLASH_TAKE_MAGIC} (only this sealed-key format is supported in FLASH 1.3.x)`,
        "secretKey",
      ),
    );
  }
  const cipher = new FlashCipher(wrapKey, WRAP_SALT);
  try {
    const secretKey = cipher.decrypt(lines[1], {
      aad: "flash-take:secretKey",
    });
    assertStrongSecret(secretKey, "secretKey");
    return secretKey;
  } catch {
    throw reportError(
      mistake(
        `failed to unseal ${FLASH_TAKE_FILENAME} (wrong ${FLASH_WRAP_FILENAME} / FLASH_WRAP_KEY?)`,
        "secretKey",
      ),
    );
  }
}

/**
 * @param {string} [dir]
 * @returns {{ wrapPath: string, takePath: string }}
 */
export function wrapPaths(dir = process.cwd()) {
  const root = path.resolve(dir);
  return {
    wrapPath: path.join(root, FLASH_WRAP_FILENAME),
    takePath: path.join(root, FLASH_TAKE_FILENAME),
  };
}

/**
 * Write wrap + sealed take. Never logs secrets.
 * @param {object} options
 * @param {string} [options.secretKey] - master key to seal (generated if omitted)
 * @param {string} [options.dir]
 * @param {boolean} [options.force]
 * @returns {{ wrapPath: string, takePath: string, generatedSecretKey: boolean }}
 */
export function writeWrappedKeyFiles(options = {}) {
  const dir = options.dir || process.cwd();
  const { wrapPath, takePath } = wrapPaths(dir);
  const force = options.force === true;

  if (!force && (fs.existsSync(wrapPath) || fs.existsSync(takePath))) {
    throw reportError(
      mistake(
        `${FLASH_WRAP_FILENAME} or ${FLASH_TAKE_FILENAME} already exists (pass force: true / --force to overwrite)`,
        "secretKey",
      ),
    );
  }

  const generatedSecretKey = !options.secretKey;
  const secretKey = options.secretKey || generateFlashSecret("flash_master");
  const wrapKey = generateFlashSecret("flash_wrap");
  assertStrongSecret(secretKey, "secretKey");
  assertStrongSecret(wrapKey, "wrapKey");

  fs.mkdirSync(path.resolve(dir), { recursive: true });
  fs.writeFileSync(wrapPath, `${wrapKey}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(wrapPath, 0o600);
  } catch {
    /* windows may ignore mode */
  }
  fs.writeFileSync(takePath, sealSecretKey(secretKey, wrapKey), {
    encoding: "utf8",
    mode: 0o644,
  });

  return { wrapPath, takePath, generatedSecretKey };
}

/**
 * Resolve master secretKey from .flash-take + (.flash-wrap | FLASH_WRAP_KEY).
 * @param {string} [dir]
 * @returns {string|null} null if no .flash-take
 */
export function resolveWrappedSecretKey(dir = process.cwd()) {
  const { wrapPath, takePath } = wrapPaths(dir);
  if (!fs.existsSync(takePath)) return null;

  const wrapKey =
    (typeof process.env.FLASH_WRAP_KEY === "string" &&
      process.env.FLASH_WRAP_KEY.trim()) ||
    (fs.existsSync(wrapPath) ? fs.readFileSync(wrapPath, "utf8").trim() : "");

  if (!wrapKey) {
    throw reportError(
      mistake(
        `${FLASH_TAKE_FILENAME} found but no wrap key — create ${FLASH_WRAP_FILENAME} or set FLASH_WRAP_KEY (never commit the wrap key)`,
        "secretKey",
      ),
    );
  }

  return unsealSecretKey(fs.readFileSync(takePath, "utf8"), wrapKey);
}
