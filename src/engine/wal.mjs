import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * FLASH Write-Ahead Log (FlashWAL)
 * Append-Only, Checksummed Transaction Log for Durability & Fast Crash Recovery
 */

export const WAL_OP = {
  INSERT: 0x01,
  UPDATE: 0x02,
  DELETE: 0x03,
  COMMIT: 0x04
};

export class FlashWAL {
  /**
   * @param {string} walPath - Absolute path to WAL file
   */
  constructor(walPath) {
    this.walPath = walPath;
    this.fd = null;
    this.writeQueue = [];
    this.isFlushing = false;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.walPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async open() {
    if (!this.fd) {
      this.fd = await fs.promises.open(this.walPath, 'a+');
    }
  }

  /**
   * Appends an operation to the WAL
   * Frame Format: [PayloadLength (uint32) | CRC32 (uint32) | OpCode (uint8) | PayloadBuffer]
   * @param {number} opCode
   * @param {string} key
   * @param {Buffer|string} data
   */
  async append(opCode, key, data) {
    const keyBuf = Buffer.from(key, 'utf-8');
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf-8');
    
    // Payload: [KeyLen (2 bytes) | Key | Data]
    const payload = Buffer.allocUnsafe(2 + keyBuf.length + dataBuf.length);
    payload.writeUInt16LE(keyBuf.length, 0);
    keyBuf.copy(payload, 2);
    dataBuf.copy(payload, 2 + keyBuf.length);

    // Frame
    const frame = Buffer.allocUnsafe(4 + 4 + 1 + payload.length);
    frame.writeUInt32LE(payload.length, 0);

    // Simple Fast CRC / Checksum
    const checksum = crypto.createHash('sha256').update(payload).digest().readUInt32LE(0);
    frame.writeUInt32LE(checksum, 4);
    frame.writeUInt8(opCode, 8);
    payload.copy(frame, 9);

    if (!this.fd) await this.open();
    await this.fd.write(frame);
  }

  /**
   * Replays WAL entries to recover MemTable state upon startup
   * @param {Function} onRecord - Callback (opCode, key, dataBuffer)
   */
  async recover(onRecord) {
    if (!fs.existsSync(this.walPath)) return;

    const fileBuffer = await fs.promises.readFile(this.walPath);
    let offset = 0;

    while (offset + 9 <= fileBuffer.length) {
      const payloadLen = fileBuffer.readUInt32LE(offset);
      const checksum = fileBuffer.readUInt32LE(offset + 4);
      const opCode = fileBuffer.readUInt8(offset + 8);

      if (offset + 9 + payloadLen > fileBuffer.length) {
        // Corrupted or truncated tail frame, stop recovery
        break;
      }

      const payload = fileBuffer.subarray(offset + 9, offset + 9 + payloadLen);
      const actualChecksum = crypto.createHash('sha256').update(payload).digest().readUInt32LE(0);

      if (actualChecksum === checksum) {
        const keyLen = payload.readUInt16LE(0);
        const key = payload.toString('utf-8', 2, 2 + keyLen);
        const data = payload.subarray(2 + keyLen);
        onRecord(opCode, key, data);
      }

      offset += 9 + payloadLen;
    }
  }

  async truncate() {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
    }
    await fs.promises.writeFile(this.walPath, Buffer.alloc(0));
    await this.open();
  }

  async close() {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
    }
  }
}
