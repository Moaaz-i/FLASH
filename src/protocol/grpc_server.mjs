import net from 'node:net';
import crypto from 'node:crypto';
import { FlashBinary } from '../binary/flash_binary.mjs';

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHmac('sha256', 'safe-key-grpc').update(a).digest();
  const hashB = crypto.createHmac('sha256', 'safe-key-grpc').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

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
   */
  constructor(db, options = {}) {
    this.db = db;
    this.port = options.port || 6743;
    this.host = options.host || '127.0.0.1';
    this.authKey = options.authKey || null;
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

        socket.on('data', async (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);

          // Frame format: [Length: 4 bytes BE] [JSON Payload]
          while (buffer.length >= 4) {
            const frameLen = buffer.readUInt32BE(0);
            if (buffer.length < 4 + frameLen) break; // Incomplete frame

            const payloadBuf = buffer.subarray(4, 4 + frameLen);
            buffer = buffer.subarray(4 + frameLen);

            try {
              const req = JSON.parse(payloadBuf.toString('utf8'));
              
              // Validate authKey if server is configured with one
              if (this.authKey) {
                if (!req.authKey || !timingSafeCompare(req.authKey, this.authKey)) {
                  throw new Error('Unauthorized: Invalid or missing authKey');
                }
              }

              const res = await this._handleRPC(req);
              const resBuf = Buffer.from(JSON.stringify(res), 'utf8');

              const header = Buffer.allocUnsafe(4);
              header.writeUInt32BE(resBuf.length, 0);
              socket.write(Buffer.concat([header, resBuf]));
            } catch (err) {
              const errBuf = Buffer.from(JSON.stringify({ error: err.message }), 'utf8');
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
    const { action, collection, payload } = req;
    const col = this.db.collection(collection);
    await col.init();

    if (action === 'insertOne') {
      const result = await col.insertOne(payload.doc);
      return { success: true, result };
    } else if (action === 'find') {
      const records = FlashBinary.decodeRecords(
        await col.find(payload.query || {}, payload.options || {}),
      );
      return { success: true, records };
    } else if (action === 'count') {
      const count = await col.count();
      return { success: true, count };
    } else if (action === 'updateOne') {
      const existing = FlashBinary.decodeRecord(
        await col.findOne(payload.filter || {}),
      );
      if (!existing) return { success: true, matchedCount: 0, modifiedCount: 0 };
      const merged = { ...existing, ...(payload.update?.$set || payload.update || {}) };
      await col.deleteOne({ _id: existing._id });
      await col.insertOne(merged);
      return { success: true, matchedCount: 1, modifiedCount: 1 };
    } else if (action === 'deleteOne') {
      const result = await col.deleteOne(payload.filter || {});
      return { success: true, result };
    } else if (action === 'applyReplication') {
      const raw = Buffer.from(payload.rawBase64, 'base64');
      await col.applyRawInsert(payload.docId, raw, null, { skipOplog: true });
      if (payload.oplogEvent) {
        await col.oplog.append(
          payload.oplogEvent.operationType,
          payload.oplogEvent.collection,
          payload.oplogEvent.docId,
        );
      }
      return { success: true, applied: true };
    } else if (action === 'explain') {
      const stats = {};
      const records = FlashBinary.decodeRecords(
        await col.find(payload.query || {}, { ...payload.options, stats }),
      );
      return { success: true, records, stats };
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
