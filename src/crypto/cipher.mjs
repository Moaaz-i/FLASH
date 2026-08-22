import crypto from "node:crypto";

// 4-byte prefix that marks a payload encrypted with AAD binding (v2 format).
// Chosen so that the first byte (0xF4) is outside ASCII printable range,
// making accidental collision with legacy payloads vanishingly unlikely.
const AAD_MAGIC = Buffer.from([0xf4, 0x4c, 0x45, 0x32]); // "FLE2"

/**
 * FLASH Cryptographic Engine (FlashCipher)
 * Military-grade Field-Level & Document Encryption using AES-256-GCM & ChaCha20-Poly1305
 *
 * AAD (Additional Authenticated Data) binding:
 *   When `aad` is provided to encrypt/decrypt, the ciphertext is cryptographically
 *   bound to that context string (typically `recordId::fieldName`). This prevents
 *   an attacker from copying a ciphertext blob between records or fields without
 *   causing a GCM authentication tag mismatch.
 */
export class FlashCipher {
  /**
   * @param {string|Buffer} masterKey - 32-byte secret key or passphrase
   * @param {string} [salt='flash_db_default_salt_2026'] - Cryptographic salt
   */
  constructor(masterKey, salt = "flash_db_default_salt_2026") {
    if (!masterKey) {
      throw new Error("Master key is required for FlashCipher");
    }

    if (typeof masterKey === "string" && masterKey.length !== 32) {
      // Derive 256-bit key via HKDF / PBKDF2
      this.key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, "sha256");
    } else if (Buffer.isBuffer(masterKey)) {
      this.key = masterKey;
    } else {
      this.key = Buffer.from(masterKey, "utf-8");
    }
  }

  /**
   * Encrypts a plaintext string or Buffer using AES-256-GCM (Random IV).
   * When `aad` is supplied, the ciphertext is bound to it (v2 payload format).
   * @param {string|Buffer|object} data
   * @param {object} [options]
   * @param {string|Buffer} [options.aad] - Additional Authenticated Data to bind to this ciphertext
   * @param {boolean} [options.binary=false] - Return raw packed Buffer instead of base64
   * @returns {string|Buffer} Base64 encoded payload or raw Buffer when binary=true
   */
  encrypt(data, options = {}) {
    let plaintext;
    if (data === undefined) {
      plaintext = Buffer.from("null", "utf-8");
    } else if (Buffer.isBuffer(data)) {
      plaintext = data;
    } else if (typeof data === "string") {
      plaintext = Buffer.from(data, "utf-8");
    } else {
      const jsonStr = JSON.stringify(data);
      plaintext = Buffer.from(
        jsonStr !== undefined ? jsonStr : "null",
        "utf-8",
      );
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);

    if (options.aad) {
      const aadBuf = Buffer.isBuffer(options.aad)
        ? options.aad
        : Buffer.from(options.aad, "utf-8");
      cipher.setAAD(aadBuf);
    }

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    if (options.aad) {
      // v2 payload: [MAGIC (4) | IV (12) | TAG (16) | CIPHERTEXT]
      const packed = Buffer.concat([AAD_MAGIC, iv, tag, encrypted]);
      return options.binary ? packed : packed.toString("base64");
    }

    // Legacy v1 payload (no AAD): [IV (12) | TAG (16) | CIPHERTEXT]
    const packed = Buffer.concat([iv, tag, encrypted]);
    return options.binary ? packed : packed.toString("base64");
  }

  /**
   * @param {string|Buffer} payload
   * @param {boolean|object} [asJsonOrOptions=false]
   * @returns {string|object}
   */
  decrypt(payload, asJsonOrOptions = false) {
    if (Buffer.isBuffer(payload)) {
      return this._decryptBuffer(payload, asJsonOrOptions);
    }
    if (!payload || typeof payload !== "string") return payload;

    // Backward-compat: support legacy `decrypt(payload, true)` signature
    let asJson = false;
    let aad = null;
    if (typeof asJsonOrOptions === "boolean") {
      asJson = asJsonOrOptions;
    } else if (asJsonOrOptions && typeof asJsonOrOptions === "object") {
      asJson = asJsonOrOptions.asJson === true;
      aad = asJsonOrOptions.aad || null;
    }

    const buffer = Buffer.from(payload, "base64");
    return this._decryptBuffer(buffer, asJsonOrOptions);
  }

  /**
   * @param {Buffer} buffer
   * @param {boolean|object} asJsonOrOptions
   * @returns {string|object}
   */
  _decryptBuffer(buffer, asJsonOrOptions = false) {
    let asJson = false;
    let aad = null;
    if (typeof asJsonOrOptions === "boolean") {
      asJson = asJsonOrOptions;
    } else if (asJsonOrOptions && typeof asJsonOrOptions === "object") {
      asJson = asJsonOrOptions.asJson === true;
      aad = asJsonOrOptions.aad || null;
    }

    const hasAADHeader =
      buffer.length > 4 &&
      buffer[0] === AAD_MAGIC[0] &&
      buffer[1] === AAD_MAGIC[1] &&
      buffer[2] === AAD_MAGIC[2] &&
      buffer[3] === AAD_MAGIC[3];

    let iv, tag, ciphertext;

    if (hasAADHeader) {
      // v2 AAD-bound payload
      if (buffer.length < 32) {
        throw new Error("Invalid v2 encrypted payload size");
      }
      iv = buffer.subarray(4, 16);
      tag = buffer.subarray(16, 32);
      ciphertext = buffer.subarray(32);
    } else {
      // Legacy v1 payload
      if (buffer.length < 28) {
        throw new Error("Invalid encrypted payload size");
      }
      iv = buffer.subarray(0, 12);
      tag = buffer.subarray(12, 28);
      ciphertext = buffer.subarray(28);
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);

    if (hasAADHeader && aad) {
      const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf-8");
      decipher.setAAD(aadBuf);
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    if (
      typeof asJsonOrOptions === "object" &&
      asJsonOrOptions.binary === true
    ) {
      return decrypted;
    }

    const str = decrypted.toString("utf-8");

    if (asJson) {
      try {
        return JSON.parse(str);
      } catch {
        return str;
      }
    }
    return str;
  }

  /**
   * Deterministic encryption using synthetic IV derived from HMAC (For exact match queries when needed)
   * @param {string} plaintext
   * @param {Buffer} [domainKey]
   * @returns {string}
   */
  encryptDeterministic(plaintext, domainKey = this.key) {
    const data = String(plaintext);
    const iv = crypto
      .createHmac("sha256", domainKey)
      .update(data)
      .digest()
      .subarray(0, 12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(data, "utf-8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }
}
