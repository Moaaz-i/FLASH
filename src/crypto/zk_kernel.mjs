import { FlashBinary } from "../binary/flash_binary.mjs";

const SEALED_META = new Set([
  "_id",
  "_enc",
  "_blind",
  "_homo",
  "_ore",
  "_plain",
  "_vec",
  "_idx",
  "_flashRecord",
  "_aad",
]);

const BLIND_QUERY_KEYS = new Set([
  "_id",
  "$exact",
  "$ngrams",
  "$range",
  "$ids",
]);

/**
 * Architectural zero-knowledge kernel.
 *
 * FLASH does not implement zk-SNARK circuits. "Zero-knowledge" here means the
 * storage engine and network daemons have zero knowledge of plaintext: they
 * never receive secretKey, never decrypt, and only store/query sealed
 * envelopes + HMAC trapdoors. Decryption exists solely on FlashClient.
 */
export class FlashZKKernel {
  /**
   * @param {object} target
   * @param {string} apiName
   */
  static requireClient(target, apiName) {
    if (
      !target ||
      typeof target.encryptDocument !== "function" ||
      typeof target.decryptDocument !== "function" ||
      typeof target.collection !== "function"
    ) {
      throw new Error(
        `${apiName} requires FlashClient. Decryption is client-only; the storage engine has zero knowledge of plaintext.`,
      );
    }
    return target;
  }

  /**
   * @param {Buffer} buf
   */
  static isSealedBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return false;
    return FlashBinary.hasField(buf, "_enc");
  }

  /**
   * @param {object} obj
   */
  static isSealedEnvelope(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    if (typeof obj._flashRecord === "string") return true;
    if (
      !obj._enc ||
      typeof obj._enc !== "object" ||
      Object.keys(obj._enc).length === 0
    ) {
      return false;
    }
    for (const key of Object.keys(obj)) {
      if (SEALED_META.has(key) || key.startsWith("_")) continue;
      return false;
    }
    return true;
  }

  /**
   * @param {Buffer|object} record
   * @param {string} [context]
   */
  static assertSealedRecord(record, context = "storage") {
    if (Buffer.isBuffer(record)) {
      if (!FlashZKKernel.isSealedBuffer(record)) {
        throw new Error(
          `Zero-knowledge violation (${context}): refusing to accept an unsealed plaintext record`,
        );
      }
      return;
    }
    if (record && typeof record._flashRecord === "string") {
      FlashZKKernel.assertSealedRecord(
        Buffer.from(record._flashRecord, "base64"),
        context,
      );
      return;
    }
    if (FlashZKKernel.isSealedEnvelope(record)) return;
    throw new Error(
      `Zero-knowledge violation (${context}): refusing to accept an unsealed plaintext record`,
    );
  }

  /**
   * @param {object} [envelope]
   * @param {string} [context]
   */
  static assertBlindQueryEnvelope(envelope = {}, context = "query") {
    if (envelope == null || typeof envelope !== "object") return;
    if (envelope.$plain) {
      throw new Error(
        `Zero-knowledge violation (${context}): plaintext field predicates are not allowed on a blind server`,
      );
    }
    for (const key of Object.keys(envelope)) {
      if (BLIND_QUERY_KEYS.has(key)) continue;
      throw new Error(
        `Zero-knowledge violation (${context}): plaintext query field "${key}" is not allowed; send trapdoors ($exact/$ngrams/$range)`,
      );
    }
  }

  /**
   * @param {Buffer} buf
   * @param {string} needle
   */
  static bufferContainsUtf8(buf, needle) {
    if (!Buffer.isBuffer(buf) || needle == null || needle === "") return false;
    return buf.includes(Buffer.from(String(needle), "utf8"));
  }
}
