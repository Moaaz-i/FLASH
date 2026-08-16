import path from 'node:path';
import fs from 'node:fs';
import { FlashCollection } from './collection.mjs';

/**
 * FLASH Database Engine (FlashDatabase)
 * High-level Database instance managing collection namespaces, transactions, and state.
 */
export class FlashDatabase {
  /**
   * @param {string} dbName
   * @param {object} [options]
   * @param {string} [options.storagePath='./data']
   */
  constructor(dbName = 'flash_db', options = {}) {
    this.dbName = dbName;
    this.storagePath = path.resolve(options.storagePath || './data', dbName);
    this.collections = new Map();
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Returns or initializes a Collection instance (Synchronous MongoDB-style interface)
   * @param {string} name
   * @returns {FlashCollection}
   */
  collection(name) {
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }

    const col = new FlashCollection(name, this.storagePath);
    this.collections.set(name, col);
    return col;
  }

  /**
   * Lists all existing collection names
   * @returns {string[]}
   */
  listCollections() {
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
      await col.wal.close();
    }
    this.collections.clear();
  }
}
