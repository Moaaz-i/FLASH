import net from "node:net";
import { FlashRecordCodec } from "../client/record_codec.mjs";
import { FlashZKKernel } from "../crypto/zk_kernel.mjs";
import { FlashRBAC } from "../security/rbac.mjs";
import { assertStrongSecret, timingSafeCompare } from "../security/trust_guard.mjs";

/**
 * FLASH High-Performance gRPC & Binary Protocol Server (FlashGRPCServer)
 * Multiplexed TCP socket server with custom protobuf-like framing for sub-millisecond polyglot microservices.
 */
export class FlashGRPCServer {
  /**
   * @param {import('../core/database.mjs').FlashDatabase} db
   * @param {object} [options]
   * @param {number} [options.port=6743]
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.authKey]
   * @param {FlashRBAC} [options.rbac]
   */
  constructor(db, options = {}) {
    this.db = db;
    this.port = options.port || 6743;
    this.host = options.host || "127.0.0.1";
    this.authKey = options.authKey || null;
    this.rbac = options.rbac instanceof FlashRBAC ? options.rbac : null;
    if (!this.authKey) {
      throw new Error("FlashGRPCServer requires authKey");
    }
    assertStrongSecret(this.authKey, "authKey");
    this.server = null;
  }

  /**
   * Starts TCP binary server
   * @returns {Promise<net.Server>}
   */
  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        let buffer = Buffer.alloc(0);

        socket.on("data", async (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);

          // Frame format: [Length: 4 bytes BE] [JSON Payload]
          while (buffer.length >= 4) {
            const frameLen = buffer.readUInt32BE(0);
            if (buffer.length < 4 + frameLen) break; // Incomplete frame

            const payloadBuf = buffer.subarray(4, 4 + frameLen);
            buffer = buffer.subarray(4 + frameLen);

            try {
              const req = JSON.parse(payloadBuf.toString("utf8"));

              // Validate authKey if server is configured with one
              if (this.authKey) {
                if (
                  !req.authKey ||
                  !timingSafeCompare(req.authKey, this.authKey)
                ) {
                  throw new Error("Unauthorized: Invalid or missing authKey");
                }
              }

              const res = await this._handleRPC(req);
              const resBuf = Buffer.from(JSON.stringify(res), "utf8");

              const header = Buffer.allocUnsafe(4);
              header.writeUInt32BE(resBuf.length, 0);
              socket.write(Buffer.concat([header, resBuf]));
            } catch (err) {
              const errBuf = Buffer.from(
                JSON.stringify({ error: err.message }),
                "utf8",
              );
              const header = Buffer.allocUnsafe(4);
              header.writeUInt32BE(errBuf.length, 0);
              socket.write(Buffer.concat([header, errBuf]));
            }
          }
        });
      });

      this.server.listen(this.port, this.host, () => {
        resolve(this.server);
      });
    });
  }

  async _handleRPC(req) {
    const { action, collection, payload, userId } = req;
    if (this.rbac) {
      const map = {
        insertOne: "write",
        find: "read",
        count: "read",
        updateOne: "write",
        deleteOne: "delete",
        applyReplication: "admin",
        explain: "read",
      };
      const needed = map[action] || "admin";
      if (
        !userId ||
        !this.rbac.can(String(userId), collection || "*", needed)
      ) {
        throw new Error("Forbidden");
      }
    }

    const col = this.db.collection(collection);
    await col.init();

    if (action === "insertOne") {
      const recordBuf = FlashRecordCodec.decodeFromWire(payload.doc);
      FlashZKKernel.assertSealedRecord(recordBuf, "FlashGRPCServer.insertOne");
      const result = await col.insertOne(recordBuf);
      return { success: true, result };
    } else if (action === "find") {
      FlashZKKernel.assertBlindQueryEnvelope(
        payload.query || {},
        "FlashGRPCServer.find",
      );
      const records = await col.find(
        payload.query || {},
        payload.options || {},
      );
      return {
        success: true,
        records: records.map((r) =>
          Buffer.isBuffer(r) ? FlashRecordCodec.encodeForWire(r) : r,
        ),
      };
    } else if (action === "count") {
      const count = await col.count();
      return { success: true, count };
    } else if (action === "updateOne") {
      if (!payload.sealedDoc) {
        throw new Error(
          "Zero-knowledge violation (FlashGRPCServer.updateOne): the server cannot merge plaintext; send sealedDoc",
        );
      }
      const recordBuf = FlashRecordCodec.decodeFromWire(payload.sealedDoc);
      FlashZKKernel.assertSealedRecord(recordBuf, "FlashGRPCServer.updateOne");
      const id = FlashRecordCodec.extractId(recordBuf);
      if (!id) throw new Error("sealedDoc must include _id");
      await col.deleteOne({ _id: id });
      const result = await col.insertOne(recordBuf);
      return { success: true, matchedCount: 1, modifiedCount: 1, result };
    } else if (action === "deleteOne") {
      FlashZKKernel.assertBlindQueryEnvelope(
        payload.filter || {},
        "FlashGRPCServer.deleteOne",
      );
      const result = await col.deleteOne(payload.filter || {});
      return { success: true, result };
    } else if (action === "applyReplication") {
      const raw = Buffer.from(payload.rawBase64, "base64");
      FlashZKKernel.assertSealedRecord(raw, "FlashGRPCServer.applyReplication");
      await col.applyRawInsert(payload.docId, raw, null, { skipOplog: true });
      if (payload.oplogEvent) {
        await col.oplog.append(
          payload.oplogEvent.operationType,
          payload.oplogEvent.collection,
          payload.oplogEvent.docId,
        );
      }
      return { success: true, applied: true };
    } else if (action === "explain") {
      FlashZKKernel.assertBlindQueryEnvelope(
        payload.query || {},
        "FlashGRPCServer.explain",
      );
      const stats = {};
      const records = await col.find(payload.query || {}, {
        ...payload.options,
        stats,
      });
      return {
        success: true,
        records: records.map((r) =>
          Buffer.isBuffer(r) ? FlashRecordCodec.encodeForWire(r) : r,
        ),
        stats,
      };
    }

    return { error: `Unsupported RPC action: ${action}` };
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
