import fs from "node:fs";
import path from "node:path";
import { FlashCompressor } from "../binary/compressor.mjs";
import { FlashCipher } from "../crypto/cipher.mjs";
import { logger } from "../core/logger.mjs";

const MAGIC = Buffer.from("FTRH");
const VERSION = 1;

/**
 * Compressed, bounded undo archive for deleted documents (single `.flash-trash` file).
 */
export class FlashTrashVault {
  /**
   * @param {string} filePath
   * @param {object} [options]
   * @param {boolean} [options.enabled=true]
   * @param {number} [options.maxEntries=500]
   * @param {number} [options.maxBytes=2097152]
   * @param {number} [options.maxAgeMs=604800000]
   * @param {string|Buffer} [options.trashSecret]
   */
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.enabled = options.enabled !== false;
    this.maxEntries = options.maxEntries ?? 500;
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    this.maxAgeMs = options.maxAgeMs ?? 7 * 24 * 3600 * 1000;
    this.trashSecret = options.trashSecret ?? null;
    this._cipher = this.trashSecret ? new FlashCipher(this.trashSecret) : null;
    /** @type {Array<{ collection: string, docId: string, deletedAt: number, kind: 'json'|'buffer', payload: Buffer }>} */
    this._entries = [];
    this._ready = false;
  }

  get byteSize() {
    return this._entries.reduce((n, e) => n + e.payload.length, 0);
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
      if (version !== VERSION) {
        logger.warn("FlashTrashVault", "unsupported trash file version", {
          version,
        });
        this._ready = true;
        return;
      }

      let offset = 8;
      while (offset + 2 <= buf.length) {
        const colLen = buf.readUInt16LE(offset);
        offset += 2;
        const collection = buf.toString("utf8", offset, offset + colLen);
        offset += colLen;
        const idLen = buf.readUInt16LE(offset);
        offset += 2;
        const docId = buf.toString("utf8", offset, offset + idLen);
        offset += idLen;
        const deletedAt = Number(buf.readBigInt64LE(offset));
        offset += 8;
        const kindCode = buf.readUInt8(offset);
        offset += 1;
        const payloadLen = buf.readUInt32LE(offset);
        offset += 4;
        const payload = buf.subarray(offset, offset + payloadLen);
        offset += payloadLen;

        this._entries.push({
          collection,
          docId,
          deletedAt,
          kind: kindCode === 1 ? "buffer" : "json",
          payload: Buffer.from(payload),
        });
      }
    } catch (err) {
      logger.warn("FlashTrashVault", "failed to load trash file", {
        error: err.message,
      });
      this._entries = [];
    }

    this._evictExpired();
    this._ready = true;
  }

  async close() {
    await this._persist();
    this._ready = false;
  }

  /**
   * @param {{ collection: string, docId: string, doc?: object, buffer?: Buffer, deletedAt?: number }} input
   */
  async archive(input) {
    if (!this.enabled) return;
    if (!this._ready) await this.open();

    const collection = String(input.collection);
    const docId = String(input.docId);
    const deletedAt = input.deletedAt ?? Date.now();

    let raw;
    let kind = "json";
    if (input.doc != null) {
      raw = Buffer.from(JSON.stringify(input.doc), "utf8");
      kind = "json";
    } else if (input.buffer) {
      raw = Buffer.isBuffer(input.buffer)
        ? input.buffer
        : Buffer.from(input.buffer);
      kind = "buffer";
    } else {
      return;
    }

    let payload = await FlashCompressor.compressBlock(raw, 9);
    if (this._cipher) {
      payload = this._cipher.encrypt(payload, {
        binary: true,
        aad: `${collection}:${docId}`,
      });
    }

    this._entries = this._entries.filter(
      (e) => !(e.collection === collection && e.docId === docId),
    );
    this._entries.push({ collection, docId, deletedAt, kind, payload });
    this._evict();
    await this._persist();
  }

  /**
   * @param {string} docId
   * @param {string} [collection]
   */
  async peek(docId, collection) {
    if (!this._ready) await this.open();
    const id = String(docId);
    for (let i = this._entries.length - 1; i >= 0; i -= 1) {
      const entry = this._entries[i];
      if (entry.docId !== id) continue;
      if (collection && entry.collection !== collection) continue;
      return this._decodeEntry(entry);
    }
    return null;
  }

  /**
   * @param {string} docId
   * @param {string} [collection]
   */
  async remove(docId, collection) {
    if (!this._ready) await this.open();
    const id = String(docId);
    const before = this._entries.length;
    this._entries = this._entries.filter((e) => {
      if (e.docId !== id) return true;
      if (collection && e.collection !== collection) return true;
      return false;
    });
    if (this._entries.length !== before) {
      await this._persist();
    }
  }

  /**
   * @param {object} [options]
   * @param {number} [options.limit=100]
   * @param {string} [options.collection]
   */
  async list(options = {}) {
    if (!this._ready) await this.open();
    const limit = options.limit ?? 100;
    const collection = options.collection;
    const rows = [];
    for (
      let i = this._entries.length - 1;
      i >= 0 && rows.length < limit;
      i -= 1
    ) {
      const e = this._entries[i];
      if (collection && e.collection !== collection) continue;
      rows.push({
        collection: e.collection,
        docId: e.docId,
        deletedAt: e.deletedAt,
        kind: e.kind,
        compressedBytes: e.payload.length,
      });
    }
    return rows;
  }

  async purge() {
    if (!this._ready) await this.open();
    this._entries = [];
    await this._persist();
  }

  _evictExpired() {
    const minTs = Date.now() - this.maxAgeMs;
    this._entries = this._entries.filter((e) => e.deletedAt >= minTs);
  }

  _evict() {
    this._evictExpired();

    while (this._entries.length > this.maxEntries) {
      this._entries.shift();
    }

    while (this.byteSize > this.maxBytes && this._entries.length > 0) {
      this._entries.shift();
    }
  }

  async _decodeEntry(entry) {
    let payload = entry.payload;
    if (this._cipher) {
      const decrypted = this._cipher.decrypt(payload, {
        binary: true,
        aad: `${entry.collection}:${entry.docId}`,
      });
      payload = Buffer.isBuffer(decrypted)
        ? decrypted
        : Buffer.from(String(decrypted), "utf8");
    }
    const raw = await FlashCompressor.decompressBlock(payload);
    if (entry.kind === "buffer") {
      return {
        collection: entry.collection,
        docId: entry.docId,
        deletedAt: entry.deletedAt,
        kind: entry.kind,
        buffer: raw,
      };
    }
    return {
      collection: entry.collection,
      docId: entry.docId,
      deletedAt: entry.deletedAt,
      kind: entry.kind,
      doc: JSON.parse(raw.toString("utf8")),
    };
  }

  async _persist() {
    if (!this.enabled) return;

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const parts = [Buffer.allocUnsafe(8)];
    MAGIC.copy(parts[0], 0);
    parts[0].writeUInt32LE(VERSION, 4);

    for (const entry of this._entries) {
      const colBuf = Buffer.from(entry.collection, "utf8");
      const idBuf = Buffer.from(entry.docId, "utf8");
      const header = Buffer.allocUnsafe(
        2 + colBuf.length + 2 + idBuf.length + 8 + 1 + 4,
      );
      let offset = 0;
      header.writeUInt16LE(colBuf.length, offset);
      offset += 2;
      colBuf.copy(header, offset);
      offset += colBuf.length;
      header.writeUInt16LE(idBuf.length, offset);
      offset += 2;
      idBuf.copy(header, offset);
      offset += idBuf.length;
      header.writeBigInt64LE(BigInt(entry.deletedAt), offset);
      offset += 8;
      header.writeUInt8(entry.kind === "buffer" ? 1 : 0, offset);
      offset += 1;
      header.writeUInt32LE(entry.payload.length, offset);
      parts.push(header, entry.payload);
    }

    const body = Buffer.concat(parts);
    const tmp = `${this.filePath}.tmp`;
    await fs.promises.writeFile(tmp, body);
    await fs.promises.rename(tmp, this.filePath);
  }
}

export function resolveTrashOptions(engineOptions = {}) {
  const trash = engineOptions.trash ?? {};
  return {
    enabled: trash.enabled !== false,
    maxEntries: trash.maxEntries ?? 500,
    maxBytes: trash.maxBytes ?? 2 * 1024 * 1024,
    maxAgeMs: trash.maxAgeMs ?? 7 * 24 * 3600 * 1000,
  };
}
