import crypto from "node:crypto";
import path from "node:path";
import { FlashMVCC } from "./mvcc.mjs";
import { FlashTxLog } from "./tx_log.mjs";

/**
 * ACID Client Session — MVCC + durable tx log + atomic batch commit.
 */
export class FlashSession {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
    this.sessionId = crypto.randomUUID();
    this.inTransaction = false;
    this.stagedOperations = [];
    this.mvcc = client?.mvcc || new FlashMVCC();
    this.mvccTx = null;
    this.writeConcern = "majority";
  }

  withWriteConcern(concern = "majority") {
    this.writeConcern = concern;
    return this;
  }

  startTransaction() {
    if (this.inTransaction) {
      throw new Error("Transaction is already active on this session");
    }
    this.inTransaction = true;
    this.stagedOperations = [];
    this.mvccTx = this.mvcc.beginTransaction(this.sessionId);
    this.client._activeSession = this;
  }

  async insert(collectionName, doc) {
    if (!this.inTransaction) throw new Error("No active transaction");
    const col = this.client.collection(collectionName);
    const validated = col.schema.validate(doc);
    validated._id = validated._id ? String(validated._id) : crypto.randomUUID();
    col.indexManager.validateUniqueConstraints(validated);
    this.mvcc.write(this.mvccTx.txId, validated._id, validated);
    this.stagedOperations.push({
      collectionName,
      type: "insert",
      doc: validated,
    });
  }

  async delete(collectionName, filter) {
    if (!this.inTransaction) throw new Error("No active transaction");
    const col = this.client.collection(collectionName);
    const existing = await col.findOne(filter);
    if (existing) {
      this.mvcc.delete(this.mvccTx.txId, String(existing._id));
      this.stagedOperations.push({
        collectionName,
        type: "delete",
        filter: { _id: existing._id },
      });
    }
  }

  async commitTransaction() {
    if (!this.inTransaction) {
      throw new Error("No active transaction to commit");
    }

    const txLogPath = path.join(
      this.client.db.storagePath,
      "sessions.txlog",
    );
    const txLog = new FlashTxLog(txLogPath);

    try {
      await txLog.appendPrepared(this.sessionId, this.stagedOperations);
      this.mvcc.commit(this.mvccTx.txId);

      for (const op of this.stagedOperations) {
        const col = this.client.collection(op.collectionName);
        if (op.type === "insert") {
          await col.insertOne(op.doc);
        } else if (op.type === "delete") {
          await col.deleteOne(op.filter);
        }
      }

      await txLog.appendCommitted(this.sessionId);
      await txLog.truncate();
    } catch (err) {
      if (this.mvccTx) this.mvcc.abort(this.mvccTx.txId);
      throw err;
    } finally {
      await txLog.close();
      this.inTransaction = false;
      this.stagedOperations = [];
      this.mvccTx = null;
      this.client._activeSession = null;
    }
  }

  async abortTransaction() {
    if (!this.inTransaction) {
      throw new Error("No active transaction to abort");
    }
    if (this.mvccTx) this.mvcc.abort(this.mvccTx.txId);
    this.inTransaction = false;
    this.stagedOperations = [];
    this.mvccTx = null;
    this.client._activeSession = null;
  }
}

export { FlashMVCC };
