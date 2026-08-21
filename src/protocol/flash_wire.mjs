import net from "node:net";
import crypto from "node:crypto";
import { FlashBSON } from "./bson.mjs";
import { FlashBinary } from "../binary/flash_binary.mjs";

const OP_MSG = 2013;
const OP_COMPRESSED = 2012;

/**
 * FLASH native binary wire protocol server (OP_MSG framing + BSON payloads).
 * Commands: handshake, ping, find, insert, update, delete, count, listCollections, createIndexes, aggregate.
 */
export class FlashWireServer {
  /**
   * @param {import('../core/database.mjs').FlashDatabase} db
   * @param {object} [options]
   * @param {number} [options.port=6744]
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.replicaSet]
   */
  constructor(db, options = {}) {
    this.db = db;
    this.port = options.port || 6744;
    this.host = options.host || "127.0.0.1";
    this.replicaSet = options.replicaSet || null;
    this.server = null;
    this.requestId = 0;
    /** @type {Map<number, { collection: string, batch: object[], offset: number }>} */
    this.cursors = new Map();
  }

  _nextCursorId() {
    return crypto.randomInt(1, 0x7fffffff);
  }

  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        let buffer = Buffer.alloc(0);
        socket.on("data", async (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 16) {
            const msgLen = buffer.readInt32LE(0);
            if (buffer.length < msgLen) break;
            const frame = buffer.subarray(0, msgLen);
            buffer = buffer.subarray(msgLen);
            const requestId = frame.readInt32LE(4);
            const opCode = frame.readInt32LE(12);
            try {
              const reply = await this._dispatch(opCode, frame);
              socket.write(this._encodeReply(requestId, reply));
            } catch (err) {
              socket.write(
                this._encodeReply(requestId, { ok: 0, errmsg: err.message }),
              );
            }
          }
        });
      });
      this.server.listen(this.port, this.host, () => resolve(this.server));
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  _encodeReply(requestId, doc) {
    const body = FlashBSON.encode(doc);
    const flagBits = Buffer.allocUnsafe(4);
    flagBits.writeUInt32LE(0, 0);
    const section = Buffer.concat([Buffer.from([0]), body]);
    const payload = Buffer.concat([flagBits, section]);
    const header = Buffer.allocUnsafe(16);
    header.writeInt32LE(16 + payload.length, 0);
    header.writeInt32LE(++this.requestId, 4);
    header.writeInt32LE(requestId, 8);
    header.writeInt32LE(OP_MSG, 12);
    return Buffer.concat([header, payload]);
  }

  async _dispatch(opCode, frame) {
    if (opCode !== OP_MSG && opCode !== OP_COMPRESSED) {
      throw new Error(`Unsupported opCode ${opCode}`);
    }
    const bodyOffset = 16 + 4 + 1;
    const { value: cmd } = FlashBSON.decode(frame, bodyOffset);
    return this._handleCommand(cmd);
  }

  async _handleCommand(cmd) {
    if (
      cmd.handshake !== undefined ||
      cmd.flashHello !== undefined ||
      cmd.hello !== undefined
    ) {
      return {
        ok: 1,
        engine: "FLASH",
        isWritablePrimary: true,
        minWireVersion: 1,
        maxWireVersion: 1,
        maxBsonObjectSize: 16777216,
        setName: this.replicaSet,
        me: `${this.host}:${this.port}`,
      };
    }

    if (cmd.ping !== undefined) {
      return { ok: 1 };
    }

    const dbName = cmd.$db || this.db.dbName;

    if (cmd.listCollections !== undefined) {
      const names = this.db.listCollections();
      const cursor = {
        id: this._nextCursorId(),
        ns: `${dbName}.$cmd.listCollections`,
        firstBatch: names.map((name) => ({
          name,
          type: "collection",
          options: {},
          info: { readOnly: false },
        })),
      };
      return { ok: 1, cursor, ns: cursor.ns };
    }

    if (cmd.find !== undefined) {
      return this._handleFind(dbName, cmd);
    }

    if (cmd.insert !== undefined) {
      return this._handleInsert(dbName, cmd);
    }

    if (cmd.update !== undefined) {
      return this._handleUpdate(dbName, cmd);
    }

    if (cmd.delete !== undefined) {
      return this._handleDelete(dbName, cmd);
    }

    if (cmd.count !== undefined) {
      const col = this.db.collection(cmd.count);
      await col.init();
      const filter = cmd.query || {};
      const docs = FlashBinary.decodeRecords(await col.find({}));
      const matched = docs.filter((d) => this._matchesFilter(d, filter));
      return { ok: 1, n: matched.length };
    }

    if (cmd.createIndexes !== undefined) {
      const col = this.db.collection(cmd.createIndexes);
      await col.init();
      const specs = cmd.indexes || [];
      const created = [];
      for (const spec of specs) {
        const name = spec.name || Object.keys(spec.key || {}).join("_");
        if (col.secondaryIndexManager) {
          col.secondaryIndexManager.createIndex(spec.key, {
            name,
            unique: !!spec.unique,
          });
        }
        created.push(name);
      }
      return {
        ok: 1,
        createdCollectionAutomatically: false,
        numIndexesBefore: 0,
        numIndexesAfter: created.length,
        indexesCreated: created,
      };
    }

    if (cmd.aggregate !== undefined) {
      const col = this.db.collection(cmd.aggregate);
      await col.init();
      let docs = FlashBinary.decodeRecords(await col.find({}));
      for (const stage of cmd.pipeline || []) {
        if (stage.$match) {
          docs = docs.filter((d) => this._matchesFilter(d, stage.$match));
        }
        if (stage.$limit) docs = docs.slice(0, stage.$limit);
        if (stage.$project) {
          docs = docs.map((d) => {
            const out = {};
            for (const [k, v] of Object.entries(stage.$project)) {
              if (v) out[k] = d[k];
            }
            return out;
          });
        }
      }
      const cursorId = this._nextCursorId();
      return {
        ok: 1,
        cursor: {
          id: cursorId,
          ns: `${dbName}.${cmd.aggregate}`,
          firstBatch: docs,
        },
      };
    }

    if (cmd.getMore !== undefined) {
      const cur = this.cursors.get(cmd.getMore);
      if (!cur) return { ok: 1, cursor: { id: 0, ns: "", firstBatch: [] } };
      const batch = cur.batch.slice(
        cur.offset,
        cur.offset + (cmd.batchSize || 101),
      );
      cur.offset += batch.length;
      const done = cur.offset >= cur.batch.length;
      if (done) this.cursors.delete(cmd.getMore);
      return {
        ok: 1,
        cursor: {
          id: done ? 0 : cmd.getMore,
          ns: `${dbName}.${cur.collection}`,
          nextBatch: batch,
        },
      };
    }

    throw new Error(
      `Unsupported command: ${Object.keys(cmd)
        .filter((k) => !k.startsWith("$"))
        .join(",")}`,
    );
  }

  async _handleFind(dbName, cmd) {
    const col = this.db.collection(cmd.find);
    await col.init();
    const filter = cmd.filter || {};
    const limit = cmd.limit ?? 101;
    const skip = cmd.skip ?? 0;
    const docs = FlashBinary.decodeRecords(await col.find({}));
    let matched = docs.filter((d) => this._matchesFilter(d, filter));
    matched = matched.slice(skip, skip + limit);

    const cursorId = this._nextCursorId();
    if (matched.length > 101) {
      this.cursors.set(cursorId, {
        collection: cmd.find,
        batch: matched,
        offset: 101,
      });
      matched = matched.slice(0, 101);
    }

    return {
      ok: 1,
      cursor: {
        id: matched.length < limit ? 0 : cursorId,
        ns: `${dbName}.${cmd.find}`,
        firstBatch: matched,
      },
    };
  }

  async _handleInsert(dbName, cmd) {
    const col = this.db.collection(cmd.insert);
    await col.init();
    const docs = cmd.documents || [];
    let n = 0;
    for (const doc of docs) {
      await col.insertOne(doc);
      n++;
    }
    return { ok: 1, n };
  }

  async _handleUpdate(dbName, cmd) {
    const col = this.db.collection(cmd.update);
    await col.init();
    const updates = cmd.updates || [];
    let nModified = 0;
    for (const u of updates) {
      const existing = await this._findOneDoc(col, u.q || {});
      if (!existing) continue;
      const merged = { ...existing, ...(u.u?.$set || u.u || {}) };
      await col.deleteOne({ _id: existing._id });
      await col.insertOne(merged);
      nModified++;
    }
    return { ok: 1, n: nModified, nModified };
  }

  async _handleDelete(dbName, cmd) {
    const col = this.db.collection(cmd.delete);
    await col.init();
    const deletes = cmd.deletes || [];
    let n = 0;
    for (const d of deletes) {
      const doc = await this._findOneDoc(col, d.q || {});
      if (!doc) continue;
      const res = await col.deleteOne({ _id: doc._id });
      n += res.deletedCount;
    }
    return { ok: 1, n };
  }

  async _findOneDoc(col, filter) {
    const docs = FlashBinary.decodeRecords(await col.find({}));
    return docs.find((d) => this._matchesFilter(d, filter)) || null;
  }

  _filterToEnvelope(filter) {
    const envelope = {};
    for (const [k, v] of Object.entries(filter)) {
      if (k === "_id") envelope._id = this._oidToString(v);
      else if (typeof v !== "object" || v === null) {
        envelope.$plain = envelope.$plain || {};
        envelope.$plain[k] = v;
      }
    }
    return envelope;
  }

  _oidToString(v) {
    if (v && v._bsontype === "ObjectId") return v.id.toString("hex");
    return String(v);
  }

  _matchesFilter(doc, filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (k === "_id") {
        const id = this._oidToString(v);
        if (String(doc._id) !== id) return false;
        continue;
      }
      if (typeof v === "object" && v !== null) {
        if (v.$gt !== undefined && !(doc[k] > v.$gt)) return false;
        if (v.$gte !== undefined && !(doc[k] >= v.$gte)) return false;
        if (v.$lt !== undefined && !(doc[k] < v.$lt)) return false;
        if (v.$lte !== undefined && !(doc[k] <= v.$lte)) return false;
        if (v.$in !== undefined && !v.$in.includes(doc[k])) return false;
      } else if (doc[k] !== v) {
        return false;
      }
    }
    return true;
  }
}

/**
 * FLASH native wire protocol client.
 */
export class FlashWireClient {
  constructor(host = "127.0.0.1", port = 6744) {
    this.host = host;
    this.port = port;
    this.requestId = 0;
  }

  async command(cmd) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.host, port: this.port },
        () => {
          const body = FlashBSON.encode(cmd);
          const flagBits = Buffer.allocUnsafe(4);
          flagBits.writeUInt32LE(0, 0);
          const section = Buffer.concat([Buffer.from([0]), body]);
          const payload = Buffer.concat([flagBits, section]);
          const reqId = ++this.requestId;
          const header = Buffer.allocUnsafe(16);
          header.writeInt32LE(16 + payload.length, 0);
          header.writeInt32LE(reqId, 4);
          header.writeInt32LE(0, 8);
          header.writeInt32LE(OP_MSG, 12);
          socket.write(Buffer.concat([header, payload]));
        },
      );

      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= 16) {
          const msgLen = buffer.readInt32LE(0);
          if (buffer.length >= msgLen) {
            const { value } = FlashBSON.decode(buffer, 16 + 4 + 1);
            socket.end();
            resolve(value);
          }
        }
      });
      socket.on("error", reject);
    });
  }
}
