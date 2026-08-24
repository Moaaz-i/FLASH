import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDurability } from "./perf_defaults.mjs";
import { frameCrc32 } from "./frame_crc.mjs";

/**
 * FLASH Arc Engine (FlashArc)
 * Append-only vault (.farc). New frames use FAR2 + CRC-32; FARC (truncated SHA-256) still recovers.
 */

export const ARC_OP = {
  INSERT: 0x01,
  UPDATE: 0x02,
  DELETE: 0x03,
  COMMIT: 0x04,
};

export const WAL_OP = ARC_OP;

export class FlashArc {
  /**
   * @param {string} arcPath
   * @param {object} [options]
   * @param {boolean} [options.syncOnWrite] - Legacy: fsync every frame
   * @param {'strict'|'balanced'|'throughput'} [options.durability]
   */
  constructor(arcPath, options = {}) {
    this.arcPath = arcPath;
    this.fd = null;
    this._writesSinceSync = 0;
    this._syncTimer = null;

    if (options.syncOnWrite === false) {
      this._durability = resolveDurability("throughput");
    } else if (options.syncOnWrite === true && !options.durability) {
      this._durability = resolveDurability("strict");
    } else {
      this._durability = resolveDurability(options.durability);
    }
    this.syncOnWrite = this._durability.syncOnWrite;
  }

  _ensureDir() {
    const dir = path.dirname(this.arcPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async open() {
    if (!this.fd) {
      this.fd = await fs.promises.open(this.arcPath, "a+");
    }
  }

  _buildFrame(opCode, key, data) {
    const keyBuf = Buffer.from(key, "utf-8");
    const dataBuf = Buffer.isBuffer(data)
      ? data
      : Buffer.from(
          typeof data === "string" ? data : JSON.stringify(data),
          "utf-8",
        );

    const payload = Buffer.allocUnsafe(2 + keyBuf.length + dataBuf.length);
    payload.writeUInt16LE(keyBuf.length, 0);
    keyBuf.copy(payload, 2);
    dataBuf.copy(payload, 2 + keyBuf.length);

    const frame = Buffer.allocUnsafe(13 + payload.length);
    frame.write("FAR2", 0, 4, "ascii");
    frame.writeUInt32LE(payload.length, 4);
    frame.writeUInt32LE(frameCrc32(payload), 8);
    frame.writeUInt8(opCode, 12);
    payload.copy(frame, 13);
    return frame;
  }

  _scheduleDebouncedSync() {
    if (this._syncTimer || !this._durability.batchSync) return;
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      this.sync().catch(() => {});
    }, this._durability.syncEveryMs);
    if (this._syncTimer.unref) this._syncTimer.unref();
  }

  async sync() {
    if (!this.fd) return;
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    await this.fd.sync();
    this._writesSinceSync = 0;
  }

  async _afterWrite(count = 1) {
    if (this.syncOnWrite) {
      await this.sync();
      return;
    }
    if (!this._durability.batchSync) return;

    this._writesSinceSync += count;
    if (this._writesSinceSync >= this._durability.syncEveryOps) {
      await this.sync();
    } else {
      this._scheduleDebouncedSync();
    }
  }

  async append(opCode, key, data) {
    const frame = this._buildFrame(opCode, key, data);
    if (!this.fd) await this.open();
    await this.fd.write(frame);
    await this._afterWrite();
  }

  async appendBatch(operations = []) {
    if (operations.length === 0) return;
    if (!this.fd) await this.open();

    const frames = operations.map(({ opCode, key, data }) =>
      this._buildFrame(opCode, key, data),
    );
    await this.fd.write(Buffer.concat(frames));
    await this._afterWrite(operations.length);
  }

  async recover(onRecord) {
    if (!fs.existsSync(this.arcPath)) return;

    const fileBuffer = await fs.promises.readFile(this.arcPath);
    let offset = 0;

    while (offset + 13 <= fileBuffer.length) {
      const magic = fileBuffer.toString("ascii", offset, offset + 4);
      if (magic !== "FAR2" && magic !== "FARC") break;

      const payloadLen = fileBuffer.readUInt32LE(offset + 4);
      const checksum = fileBuffer.readUInt32LE(offset + 8);
      const opCode = fileBuffer.readUInt8(offset + 12);

      if (offset + 13 + payloadLen > fileBuffer.length) break;

      const payload = fileBuffer.subarray(offset + 13, offset + 13 + payloadLen);
      const actualChecksum =
        magic === "FAR2"
          ? frameCrc32(payload)
          : crypto
              .createHash("sha256")
              .update(payload)
              .digest()
              .readUInt32LE(0);

      if (actualChecksum === checksum) {
        const keyLen = payload.readUInt16LE(0);
        const key = payload.toString("utf-8", 2, 2 + keyLen);
        const data = payload.subarray(2 + keyLen);
        onRecord(opCode, key, data);
      }

      offset += 13 + payloadLen;
    }
  }

  async truncate() {
    if (this.fd) {
      await this.sync();
      await this.fd.close();
      this.fd = null;
    }
    await fs.promises.writeFile(this.arcPath, Buffer.alloc(0));
    await this.open();
    await this.sync();
  }

  async close() {
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    if (this.fd) {
      await this.sync();
      await this.fd.close();
      this.fd = null;
    }
  }
}

export const FlashWAL = FlashArc;
