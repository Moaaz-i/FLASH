import fs from "node:fs";
import path from "node:path";

/**
 * Generic document lifecycle: expiry, max count, optional archive-before-delete.
 * Works for logs, messages, events, sessions — any collection.
 */
export class FlashLifecycle {
  /**
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   * @param {object} [options]
   * @param {number} [options.expireAfterMs] - Delete docs older than this
   * @param {number} [options.maxDocuments] - Keep at most N newest docs
   * @param {string} [options.timeField='createdAt'] - Timestamp field on decrypted docs
   * @param {string} [options.archivePath] - Append deleted docs as NDJSON before purge
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.expireAfterMs = options.expireAfterMs ?? null;
    this.maxDocuments = options.maxDocuments ?? null;
    this.timeField = options.timeField || "createdAt";
    this.archivePath = options.archivePath || null;
  }

  _timestamp(doc) {
    const v = doc[this.timeField];
    if (v == null) return 0;
    const ts = new Date(v).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  async _archiveDoc(doc) {
    if (!this.archivePath) return;
    const dir = path.dirname(this.archivePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.archivePath, `${JSON.stringify(doc)}\n`, "utf8");
  }

  /**
   * @returns {Promise<{ expired: number, trimmed: number }>}
   */
  async sweep() {
    await this.collection.init();
    let docs = await this.collection.find({}).exec();
    const now = Date.now();
    let expired = 0;
    let trimmed = 0;

    if (this.expireAfterMs != null) {
      for (const doc of docs) {
        const ts = this._timestamp(doc);
        if (ts > 0 && now - ts > this.expireAfterMs) {
          await this._archiveDoc(doc);
          await this.collection.deleteOne({ _id: doc._id });
          expired++;
        }
      }
      docs = docs.filter((d) => {
        const ts = this._timestamp(d);
        return !(ts > 0 && now - ts > this.expireAfterMs);
      });
    }

    if (this.maxDocuments != null && docs.length > this.maxDocuments) {
      docs.sort((a, b) => this._timestamp(a) - this._timestamp(b));
      const excess = docs.length - this.maxDocuments;
      for (let i = 0; i < excess; i++) {
        const doc = docs[i];
        await this._archiveDoc(doc);
        await this.collection.deleteOne({ _id: doc._id });
        trimmed++;
      }
    }

    return { expired, trimmed };
  }
}
