import path from 'node:path';
import fs from 'node:fs';
import { FlashCollection } from './collection.mjs';
import { FlashMVCC } from '../transactions/mvcc.mjs';
import { FlashTxLog } from '../transactions/tx_log.mjs';
import { FlashWorkerPool } from '../engine/worker_pool.mjs';
import { FlashTrashVault, resolveTrashOptions } from '../engine/trash_vault.mjs';

/**
 * FLASH Database Engine (FlashDatabase)
 */
export class FlashDatabase {
  constructor(dbName = 'flash_db', options = {}) {
    this.dbName = dbName;
    this.inMemory =
      options.inMemory === true || options.storagePath === ':memory:';
    this.storagePath = this.inMemory
      ? ':memory:'
      : path.resolve(options.storagePath || './data', dbName);
    this.collections = new Map();
    this.mvcc = new FlashMVCC();
    this.engineOptions = options.engineOptions || {};
    this.trashVault = null;

    if (!this.inMemory) {
      this._ensureDir();
      const trashOpts = resolveTrashOptions(this.engineOptions);
      if (trashOpts.enabled) {
        this.trashVault = new FlashTrashVault(
          path.join(this.storagePath, ".flash-trash"),
          {
            ...trashOpts,
            trashSecret: this.engineOptions.trashSecret,
          },
        );
      }
    }
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Returns or initializes a Collection instance (synchronous document DB interface)
   * @param {string} name
   * @returns {FlashCollection}
   */
  collection(name) {
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }

    const col = new FlashCollection(name, this.storagePath, {
      mvcc: this.mvcc,
      inMemory: this.inMemory,
      trashVault: this.trashVault,
      ...this.engineOptions,
    });
    this.collections.set(name, col);
    return col;
  }

  /**
   * Lists all existing collection names
   * @returns {string[]}
   */
  listCollections() {
    if (this.inMemory) {
      return [...this.collections.keys()];
    }
    if (!fs.existsSync(this.storagePath)) return [];
    return fs.readdirSync(this.storagePath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  /**
   * Drops a collection and its on-disk files
   * @param {string} name
   */
  async dropCollection(name) {
    if (this.collections.has(name)) {
      const col = this.collections.get(name);
      await col.wal.close();
      this.collections.delete(name);
    }
    if (this.inMemory) return;
    const colDir = path.join(this.storagePath, name);
    if (fs.existsSync(colDir)) {
      await fs.promises.rm(colDir, { recursive: true, force: true });
    }
  }

  /**
   * Graceful database shutdown
   */
  async close() {
    for (const col of this.collections.values()) {
      await col.close();
    }
    this.collections.clear();
    if (this.trashVault) {
      await this.trashVault.close();
    }
    if (FlashWorkerPool._defaultInstance) {
      await FlashWorkerPool._defaultInstance.shutdown();
    }
  }

  /**
   * Replay prepared-but-uncommitted transactions after crash.
   * @param {object} [options]
   * @param {boolean} [options.replay=true] - if false, only report pending txs
   */
  async recoverTransactions(options = {}) {
    const txLogPath = path.join(this.storagePath, 'sessions.txlog');
    const txLog = new FlashTxLog(txLogPath);
    const pending = await txLog.findPendingPrepared();
    await txLog.close();

    const replay = options.replay !== false;
    const recovered = [];

    for (const tx of pending) {
      if (!replay) {
        recovered.push({ txId: tx.txId, status: 'pending', operations: tx.operations.length });
        continue;
      }
      for (const op of tx.operations) {
        const col = this.collection(op.collectionName);
        await col.init();
        if (op.type === 'insert') {
          await col.insertOne(op.doc);
        } else if (op.type === 'delete') {
          await col.deleteOne(op.filter);
        }
      }
      recovered.push({ txId: tx.txId, status: 'replayed', operations: tx.operations.length });
    }

    if (replay && pending.length > 0) {
      const log = new FlashTxLog(txLogPath);
      for (const tx of pending) {
        await log.appendCommitted(tx.txId);
      }
      await log.truncate();
      await log.close();
    }

    return { pending: pending.length, recovered };
  }
}
