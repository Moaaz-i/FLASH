import net from "node:net";
import { FlashZKKernel } from "../crypto/zk_kernel.mjs";
import { timingSafeCompare } from "../security/trust_guard.mjs";

/**
 * TCP RPC for cross-process replica replication (oplog apply).
 * Frame: [4B length BE][UTF-8 JSON payload]
 */
export class FlashReplicationServer {
  /**
   * @param {import('../core/database.mjs').FlashDatabase} db
   * @param {object} [options]
   * @param {number} [options.port=6750]
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.authKey]
   */
  constructor(db, options = {}) {
    this.db = db;
    this.port = options.port || 6750;
    this.host = options.host || "127.0.0.1";
    this.authKey = options.authKey || null;
    if (!this.authKey) {
      throw new Error("FlashReplicationServer requires authKey");
    }
    this.server = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        let buffer = Buffer.alloc(0);
        socket.on("data", async (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 4) {
            const frameLen = buffer.readUInt32BE(0);
            if (buffer.length < 4 + frameLen) break;
            const payload = JSON.parse(
              buffer.subarray(4, 4 + frameLen).toString("utf-8"),
            );
            buffer = buffer.subarray(4 + frameLen);
            try {
              const result = await this._handle(payload);
              this._write(socket, { success: true, result });
            } catch (err) {
              this._write(socket, { success: false, error: err.message });
            }
          }
        });
      });
      this.server.listen(this.port, this.host, () => resolve(this.server));
    });
  }

  async _handle(req) {
    const { action, authKey } = req;

    if (this.authKey) {
      if (!authKey || !timingSafeCompare(authKey, this.authKey)) {
        throw new Error("Unauthorized: Invalid or missing replication authKey");
      }
    }

    if (action === "ping") return { pong: true };

    if (action === "applyInsert") {
      const col = this.db.collection(req.collection);
      await col.init();
      const raw = Buffer.from(req.rawBase64, "base64");
      FlashZKKernel.assertSealedRecord(
        raw,
        "FlashReplicationServer.applyInsert",
      );
      await col.applyRawInsert(req.docId, raw, null, { skipOplog: true });
      if (req.oplogEvent) {
        await col.oplog.append(
          req.oplogEvent.operationType,
          req.oplogEvent.collection,
          req.oplogEvent.docId,
        );
      }
      return { applied: true, docId: req.docId };
    }

    if (action === "tailOplog") {
      const col = this.db.collection(req.collection);
      await col.init();
      const events = await col.oplog.readFrom(req.afterSeq || 0);
      return { events };
    }

    if (action === "getRawDoc") {
      const col = this.db.collection(req.collection);
      await col.init();
      const raw = await col._getRawDoc(req.docId);
      return {
        rawBase64: raw ? raw.toString("base64") : null,
      };
    }

    throw new Error(`Unknown replication action: ${action}`);
  }

  _write(socket, obj) {
    const body = Buffer.from(JSON.stringify(obj), "utf-8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(body.length, 0);
    socket.write(Buffer.concat([header, body]));
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export class FlashReplicationClient {
  /**
   * @param {string} host
   * @param {number} port
   * @param {string} [authKey]
   */
  constructor(host, port, authKey = null) {
    this.host = host;
    this.port = port;
    this.authKey = authKey;
  }

  async call(payload) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.host, port: this.port },
        () => {
          if (this.authKey) {
            payload.authKey = this.authKey;
          }
          const body = Buffer.from(JSON.stringify(payload), "utf-8");
          const header = Buffer.allocUnsafe(4);
          header.writeUInt32BE(body.length, 0);
          socket.write(Buffer.concat([header, body]));
        },
      );

      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= 4) {
          const frameLen = buffer.readUInt32BE(0);
          if (buffer.length >= 4 + frameLen) {
            const res = JSON.parse(
              buffer.subarray(4, 4 + frameLen).toString("utf-8"),
            );
            socket.end();
            if (res.success) resolve(res.result);
            else reject(new Error(res.error));
          }
        }
      });
      socket.on("error", reject);
    });
  }

  ping() {
    return this.call({ action: "ping" });
  }

  applyInsert(collection, docId, rawBuf, oplogEvent) {
    return this.call({
      action: "applyInsert",
      collection,
      docId,
      rawBase64: rawBuf.toString("base64"),
      oplogEvent,
    });
  }
}
