import crypto from "node:crypto";
import { ARC_OP } from "../engine/arc.mjs";

/**
 * In-memory append-only WAL — same frame layout as FlashArc, no filesystem.
 */
export class MemoryArc {
  constructor() {
    /** @type {Buffer[]} */
    this._frames = [];
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
    frame.write("FARC", 0, 4, "ascii");
    frame.writeUInt32LE(payload.length, 4);
    const checksum = crypto
      .createHash("sha256")
      .update(payload)
      .digest()
      .readUInt32LE(0);
    frame.writeUInt32LE(checksum, 8);
    frame.writeUInt8(opCode, 12);
    payload.copy(frame, 13);
    return frame;
  }

  async open() {}

  async sync() {}

  async append(opCode, key, data) {
    this._frames.push(this._buildFrame(opCode, key, data));
  }

  async appendBatch(operations = []) {
    for (const { opCode, key, data } of operations) {
      await this.append(opCode, key, data);
    }
  }

  async recover(onRecord) {
    for (const fileBuffer of this._frames) {
      let offset = 0;
      while (offset + 13 <= fileBuffer.length) {
        const magic = fileBuffer.toString("ascii", offset, offset + 4);
        if (magic !== "FARC") break;

        const payloadLen = fileBuffer.readUInt32LE(offset + 4);
        const checksum = fileBuffer.readUInt32LE(offset + 8);
        const opCode = fileBuffer.readUInt8(offset + 12);

        if (offset + 13 + payloadLen > fileBuffer.length) break;

        const payload = fileBuffer.subarray(offset + 13, offset + 13 + payloadLen);
        const actualChecksum = crypto
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
  }

  async truncate() {
    this._frames = [];
  }

  async close() {}
}

export { ARC_OP };
