import crypto from 'node:crypto';
import { FlashMVCC } from './mvcc.mjs';

/**
 * FLASH ACID Client Session & Transaction Context (FlashSession)
 * Supports atomic multi-document operations, snapshot isolation, MVCC, and rollback
 */
export class FlashSession {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
    this.sessionId = crypto.randomUUID();
    this.inTransaction = false;
    this.stagedOperations = []; // Array of { collectionName, type: 'insert'|'update'|'delete', doc, filter }
    this.mvcc = client?.mvcc || new FlashMVCC();
    this.mvccTx = null;
  }

  startTransaction() {
    if (this.inTransaction) {
      throw new Error('Transaction is already active on this session');
    }
    this.inTransaction = true;
    this.stagedOperations = [];
    this.mvccTx = this.mvcc.beginTransaction(this.sessionId);
  }

  /**
   * Commits all staged operations atomically with MVCC conflict check
   */
  async commitTransaction() {
    if (!this.inTransaction) {
      throw new Error('No active transaction to commit');
    }

    try {
      if (this.mvccTx) {
        this.mvcc.commit(this.mvccTx.txId);
      }

      // Execute all staged writes
      for (const op of this.stagedOperations) {
        const col = this.client.collection(op.collectionName);
        if (op.type === 'insert') {
          await col.insertOne(op.doc);
        } else if (op.type === 'delete') {
          await col.deleteOne(op.filter);
        }
      }
    } catch (err) {
      if (this.mvccTx) {
        this.mvcc.abort(this.mvccTx.txId);
      }
      throw err;
    } finally {
      this.inTransaction = false;
      this.stagedOperations = [];
      this.mvccTx = null;
    }
  }

  /**
   * Aborts and discards all staged operations without applying to disk/memory
   */
  async abortTransaction() {
    if (!this.inTransaction) {
      throw new Error('No active transaction to abort');
    }
    if (this.mvccTx) {
      this.mvcc.abort(this.mvccTx.txId);
    }
    this.inTransaction = false;
    this.stagedOperations = [];
    this.mvccTx = null;
  }
}

export { FlashMVCC };

