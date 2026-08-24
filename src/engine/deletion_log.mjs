import fs from "node:fs";
import path from "node:path";
import { FlashCompressor } from "../binary/compressor.mjs";
import { FlashCipher } from "../crypto/cipher.mjs";
import { logger } from "../core/logger.mjs";

const MAGIC = Buffer.from("FDEL");
const VERSION_PLAIN = 1;
const VERSION_SEALED = 2;
const AAD = "flash-deletion-log";

/** @typedef {'delete' | 'restore' | 'drop_collection'} DeletionLogAction */

const ACTION_CODE = {
  delete: 0,
  restore: 1,
  drop_collection: 2,
};

const ACTION_NAME = ["delete", "restore", "drop_collection"];

/**
 * Optional, permanent deletion activity log (metadata only — not a restore archive).
 * Disabled by default; when enabled, the on-disk file is deflate-compressed + AES sealed.
 */
export class FlashDeletionLog {
  /**
   * @param {string} filePath
   * @param {object} [options]
   * @param {boolean} [options.enabled=false]
   * @param {string|Buffer} [options.logSecret]
   */
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.enabled = options.enabled === true;
    this.logSecret = options.logSecret ?? null;
    this._cipher = null;
    /** @type {Array<{ collection: string, docId: string, action: DeletionLogAction, at: number, restorable: boolean }>} */
    this._entries = [];
    this._ready = false;
  }

  _ensureCipher() {
    if (!this._cipher && this.logSecret) {
      this._cipher = new FlashCipher(this.logSecret);
    }
    return this._cipher;
  }

  get byteSize() {
    return this._entries.reduce((n, e) => {
      return n + e.collection.length + e.docId.length + 16;
    }, 0);
  }

  async open() {
    if (this._ready || !this.enabled) {
      this._ready = true;
      return;
    }
    if (!fs.existsSync(this.filePath)) {
      this._ready = true;
      return;
    }

    try {
      const buf = await fs.promises.readFile(this.filePath);
      if (buf.length < 8 || !buf.subarray(0, 4).equals(MAGIC)) {
        this._ready = true;
        return;
      }

      const version = buf.readUInt32LE(4);
      if (version === VERSION_SEALED) {
        this._ensureCipher();
        if (!this._cipher) {
          logger.warn(
            "FlashDeletionLog",
            "sealed log file requires logSecret to decrypt",
          );
          this._entries = [];
        } else if (buf.length < 12) {
          this._entries = [];
        } else {
          const payloadLen = buf.readUInt32LE(8);
          const sealed = buf.subarray(12, 12 + payloadLen);
          const decrypted = this._cipher.decrypt(sealed, {
            binary: true,
            aad: AAD,
          });
          const compressed = Buffer.isBuffer(decrypted)
            ? decrypted
            : Buffer.from(String(decrypted), "utf8");
          const plain = await FlashCompressor.decompressBlock(compressed);
          this._entries = this._parsePlainBody(plain);
        }
      } else if (version === VERSION_PLAIN) {
        this._entries = this._parsePlainBody(buf.subarray(8));
      } else {
        logger.warn("FlashDeletionLog", "unsupported log file version", {
          version,
        });
        this._entries = [];
      }
    } catch (err) {
      logger.warn("FlashDeletionLog", "failed to load deletion log", {
        error: err.message,
      });
      this._entries = [];
    }

    this._ready = true;
  }

  async close() {
    await this._persist();
    this._ready = false;
  }

  /**
   * @param {{ collection: string, docId?: string, action: DeletionLogAction, at?: number, restorable?: boolean }} input
   */
  async append(input) {
    if (!this.enabled) return;
    if (!this._ready) await this.open();

    this._entries.push({
      collection: String(input.collection),
      docId: input.docId != null ? String(input.docId) : "",
      action: input.action,
      at: input.at ?? Date.now(),
      restorable: input.restorable === true,
    });

    await this._persist();
  }

  /**
   * @param {object} [options]
   * @param {number} [options.limit=100]
   * @param {string} [options.collection]
   * @param {DeletionLogAction} [options.action]
   */
  async list(options = {}) {
    if (!this.enabled) return [];
    if (!this._ready) await this.open();

    const limit = options.limit ?? 100;
    const collection = options.collection;
    const action = options.action;
    const rows = [];

    for (let i = this._entries.length - 1; i >= 0 && rows.length < limit; i -= 1) {
      const e = this._entries[i];
      if (collection && e.collection !== collection) continue;
      if (action && e.action !== action) continue;
      rows.push({ ...e });
    }

    return rows;
  }

  async purge() {
    if (!this.enabled) return;
    if (!this._ready) await this.open();
    this._entries = [];
    await this._persist();
  }

  /**
   * @param {string} collection
   * @returns {Promise<number>}
   */
  async purgeCollection(collection) {
    if (!this.enabled) return 0;
    if (!this._ready) await this.open();
    const name = String(collection);
    const before = this._entries.length;
    this._entries = this._entries.filter((e) => e.collection !== name);
    const removed = before - this._entries.length;
    if (removed > 0) {
      await this._persist();
    }
    return removed;
  }

  /**
   * @param {Buffer} body
   */
  _parsePlainBody(body) {
    /** @type {Array<{ collection: string, docId: string, action: DeletionLogAction, at: number, restorable: boolean }>} */
    const entries = [];
    let offset = 0;
    while (offset + 2 <= body.length) {
      const colLen = body.readUInt16LE(offset);
      offset += 2;
      const collection = body.toString("utf8", offset, offset + colLen);
      offset += colLen;
      const idLen = body.readUInt16LE(offset);
      offset += 2;
      const docId = body.toString("utf8", offset, offset + idLen);
      offset += idLen;
      const at = Number(body.readBigInt64LE(offset));
      offset += 8;
      const actionCode = body.readUInt8(offset);
      offset += 1;
      const restorable = body.readUInt8(offset) === 1;
      offset += 1;

      entries.push({
        collection,
        docId,
        action: ACTION_NAME[actionCode] || "delete",
        at,
        restorable,
      });
    }
    return entries;
  }

  _serializePlainBody() {
    const parts = [];
    for (const entry of this._entries) {
      const colBuf = Buffer.from(entry.collection, "utf8");
      const idBuf = Buffer.from(entry.docId, "utf8");
      const row = Buffer.allocUnsafe(2 + colBuf.length + 2 + idBuf.length + 8 + 2);
      let offset = 0;
      row.writeUInt16LE(colBuf.length, offset);
      offset += 2;
      colBuf.copy(row, offset);
      offset += colBuf.length;
      row.writeUInt16LE(idBuf.length, offset);
      offset += 2;
      idBuf.copy(row, offset);
      offset += idBuf.length;
      row.writeBigInt64LE(BigInt(entry.at), offset);
      offset += 8;
      row.writeUInt8(ACTION_CODE[entry.action] ?? 0, offset);
      offset += 1;
      row.writeUInt8(entry.restorable ? 1 : 0, offset);
      parts.push(row);
    }
    return Buffer.concat(parts);
  }

  async _persist() {
    if (!this.enabled) return;
    this._ensureCipher();
    if (!this._cipher) {
      throw new Error(
        "FlashDeletionLog requires logSecret (derived from secretKey via FlashClient)",
      );
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const plain = this._serializePlainBody();
    let payload = await FlashCompressor.compressBlock(plain, 9);
    payload = this._cipher.encrypt(payload, { binary: true, aad: AAD });

    const header = Buffer.allocUnsafe(12);
    MAGIC.copy(header, 0);
    header.writeUInt32LE(VERSION_SEALED, 4);
    header.writeUInt32LE(payload.length, 8);

    const tmp = `${this.filePath}.tmp`;
    await fs.promises.writeFile(tmp, Buffer.concat([header, payload]));
    await fs.promises.rename(tmp, this.filePath);
  }
}

export function resolveDeletionLogOptions(engineOptions = {}) {
  const log = engineOptions.deletionLog ?? {};
  return {
    enabled: log.enabled === true,
  };
}
