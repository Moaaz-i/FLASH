import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Append-only operation log for durable change streams with resume tokens.
 * Frame: [Magic 4B "OPLG"][Seq 8B][Ts 8B][Op 1B][ColLen 2B][Col][KeyLen 2B][Key][MetaLen 4B][Meta JSON]
 */
const OLOG_MAGIC = Buffer.from('OPLG');

export class FlashOplog {
  /**
   * @param {string} oplogPath
   */
  constructor(oplogPath) {
    this.oplogPath = oplogPath;
    this.fd = null;
    this.seq = 0;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.oplogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async open() {
    if (this.fd) return;
    this.fd = await fs.promises.open(this.oplogPath, 'a+');
    if (fs.existsSync(this.oplogPath)) {
      const buf = await fs.promises.readFile(this.oplogPath);
      let offset = 0;
      while (offset + 29 <= buf.length) {
        if (buf.toString('ascii', offset, offset + 4) !== 'OPLG') break;
        const seq = Number(buf.readBigUInt64BE(offset + 4));
        if (seq > this.seq) this.seq = seq;
        const colLen = buf.readUInt16BE(offset + 21);
        const keyLen = buf.readUInt16BE(offset + 23 + colLen);
        const metaLen = buf.readUInt32BE(offset + 25 + colLen + keyLen);
        offset += 29 + colLen + keyLen + metaLen;
      }
    }
  }

  /**
   * @param {'insert'|'update'|'delete'} operationType
   * @param {string} collectionName
   * @param {string} docId
   * @param {object} [meta={}]
   * @returns {Promise<{ resumeToken: string, seq: number }>}
   */
  async append(operationType, collectionName, docId, meta = {}) {
    if (!this.fd) await this.open();

    const opCode = operationType === 'insert' ? 1 : operationType === 'update' ? 2 : 3;
    const seq = ++this.seq;
    const ts = Date.now();
    const colBuf = Buffer.from(collectionName, 'utf-8');
    const keyBuf = Buffer.from(String(docId), 'utf-8');
    const metaBuf = Buffer.from(JSON.stringify(meta), 'utf-8');

    const frame = Buffer.allocUnsafe(29 + colBuf.length + keyBuf.length + metaBuf.length);
    OLOG_MAGIC.copy(frame, 0);
    frame.writeBigUInt64BE(BigInt(seq), 4);
    frame.writeBigUInt64BE(BigInt(ts), 12);
    frame.writeUInt8(opCode, 20);
    frame.writeUInt16BE(colBuf.length, 21);
    colBuf.copy(frame, 23);
    frame.writeUInt16BE(keyBuf.length, 23 + colBuf.length);
    keyBuf.copy(frame, 25 + colBuf.length);
    frame.writeUInt32BE(metaBuf.length, 25 + colBuf.length + keyBuf.length);
    metaBuf.copy(frame, 29 + colBuf.length + keyBuf.length);

    await this.fd.write(frame);
    await this.fd.sync();

    const resumeToken = crypto.createHash('sha256').update(`${seq}:${ts}:${docId}`).digest('hex');
    return { resumeToken, seq };
  }

  /**
   * @param {number} [afterSeq=0]
   * @returns {Promise<Array<object>>}
   */
  async readFrom(afterSeq = 0) {
    if (!fs.existsSync(this.oplogPath)) return [];
    const buf = await fs.promises.readFile(this.oplogPath);
    const events = [];
    let offset = 0;

    while (offset + 29 <= buf.length) {
      if (buf.toString('ascii', offset, offset + 4) !== 'OPLG') break;
      const seq = Number(buf.readBigUInt64BE(offset + 4));
      const ts = Number(buf.readBigUInt64BE(offset + 12));
      const opCode = buf.readUInt8(offset + 20);
      const colLen = buf.readUInt16BE(offset + 21);
      const colStart = offset + 23;
      const collection = buf.toString('utf-8', colStart, colStart + colLen);
      const keyLen = buf.readUInt16BE(offset + 23 + colLen);
      const keyStart = offset + 25 + colLen;
      const docId = buf.toString('utf-8', keyStart, keyStart + keyLen);
      const metaLen = buf.readUInt32BE(offset + 25 + colLen + keyLen);
      const metaStart = offset + 29 + colLen + keyLen;
      let meta = {};
      try {
        meta = JSON.parse(buf.toString('utf-8', metaStart, metaStart + metaLen));
      } catch {}

      if (seq > afterSeq) {
        events.push({
          seq,
          timestamp: ts,
          operationType: opCode === 1 ? 'insert' : opCode === 2 ? 'update' : 'delete',
          collection,
          docId,
          meta,
          resumeToken: crypto.createHash('sha256').update(`${seq}:${ts}:${docId}`).digest('hex')
        });
      }

      offset = metaStart + metaLen;
    }

    return events;
  }

  async close() {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
    }
  }
}
