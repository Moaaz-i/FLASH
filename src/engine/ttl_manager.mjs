import { FlashBinary } from "../binary/flash_binary.mjs";

/**
 * FLASH Background TTL Expiration & Garbage Collector (FlashTTLManager)
 * Scans all active document IDs (memtable + SSTables), not memtable-only.
 */
export class FlashTTLManager {
  /**
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @param {object} [options]
   * @param {string} [options.field='createdAt']
   * @param {number} [options.expireAfterSeconds=3600]
   * @param {number} [options.intervalMs=5000]
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.field = options.field || "createdAt";
    this.expireAfterSeconds = options.expireAfterSeconds || 3600;
    this.intervalMs = options.intervalMs || 5000;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.purgeExpired();
    }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _extractTimestamp(rawBuf, docId) {
    try {
      const doc = FlashBinary.deserialize(rawBuf);
      if (doc._plain?.[this.field] != null) {
        return new Date(doc._plain[this.field]).getTime();
      }
      if (doc[this.field] != null) {
        return new Date(doc[this.field]).getTime();
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  async purgeExpired() {
    try {
      if (!this.collection.isReady) await this.collection.init();
      const cutoffTime = Date.now() - this.expireAfterSeconds * 1000;
      let purgedCount = 0;

      for (const docId of this.collection.docIdSet) {
        const raw = await this.collection._getRawDoc(docId);
        if (!raw || raw._tombstone) continue;

        const ts = this._extractTimestamp(raw, docId);
        if (ts != null && ts < cutoffTime) {
          await this.collection.deleteOne({ _id: docId });
          purgedCount++;
        }
      }

      return purgedCount;
    } catch {
      return 0;
    }
  }
}
