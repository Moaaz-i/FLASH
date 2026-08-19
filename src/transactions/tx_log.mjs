import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TX_MAGIC = Buffer.from("FTXL");

/**
 * Durable transaction log for ACID commit/abort recovery.
 */
export class FlashTxLog {
  /**
   * @param {string} txLogPath
   */
  constructor(txLogPath) {
    this.txLogPath = txLogPath;
    this.fd = null;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.txLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async open() {
    if (!this.fd) {
      this.fd = await fs.promises.open(this.txLogPath, "a+");
    }
  }

  /**
   * @param {string} txId
   * @param {Array<object>} operations
   */
  async appendPrepared(txId, operations) {
    if (!this.fd) await this.open();
    const payload = Buffer.from(
      JSON.stringify({ txId, operations, ts: Date.now() }),
      "utf-8",
    );
    const frame = Buffer.allocUnsafe(8 + payload.length);
    TX_MAGIC.copy(frame, 0);
    frame.writeUInt32LE(payload.length, 4);
    payload.copy(frame, 8);
    await this.fd.write(frame);
    await this.fd.sync();
  }

  async appendCommitted(txId) {
    if (!this.fd) await this.open();
    const payload = Buffer.from(JSON.stringify({ txId, status: "committed" }), "utf-8");
    const frame = Buffer.allocUnsafe(8 + payload.length);
    TX_MAGIC.copy(frame, 0);
    frame.writeUInt32LE(payload.length, 4);
    payload.copy(frame, 8);
    await this.fd.write(frame);
    await this.fd.sync();
  }

  async truncate() {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
    }
    await fs.promises.writeFile(this.txLogPath, Buffer.alloc(0));
    await this.open();
    await this.fd.sync();
  }

  async close() {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
    }
  }

  /**
   * Read all tx log frames.
   * @returns {Promise<Array<{ kind: 'prepared'|'committed', txId: string, operations?: Array, ts?: number }>>}
   */
  async readEntries() {
    if (!fs.existsSync(this.txLogPath)) return [];
    const buf = await fs.promises.readFile(this.txLogPath);
    const entries = [];
    let offset = 0;

    while (offset + 8 <= buf.length) {
      if (buf.toString("ascii", offset, offset + 4) !== "FTXL") break;
      const len = buf.readUInt32LE(offset + 4);
      if (offset + 8 + len > buf.length) break;
      const payload = JSON.parse(
        buf.toString("utf-8", offset + 8, offset + 8 + len),
      );
      if (payload.status === "committed") {
        entries.push({ kind: "committed", txId: payload.txId });
      } else {
        entries.push({
          kind: "prepared",
          txId: payload.txId,
          operations: payload.operations || [],
          ts: payload.ts,
        });
      }
      offset += 8 + len;
    }

    return entries;
  }

  /**
   * Find prepared transactions that were never committed (crash recovery).
   */
  async findPendingPrepared() {
    const entries = await this.readEntries();
    const committed = new Set(
      entries.filter((e) => e.kind === "committed").map((e) => e.txId),
    );
    const pending = new Map();
    for (const e of entries) {
      if (e.kind === "prepared") pending.set(e.txId, e);
    }
    for (const txId of committed) pending.delete(txId);
    return [...pending.values()];
  }
}
