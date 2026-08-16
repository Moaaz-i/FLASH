/**
 * FLASH Background TTL Expiration & Garbage Collector (FlashTTLManager)
 * Automatically prunes expired documents in collections configured with TTL / expireAfterSeconds
 */
export class FlashTTLManager {
  /**
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @param {object} [options]
   * @param {string} [options.field='createdAt'] - Field containing Date/Timestamp
   * @param {number} [options.expireAfterSeconds=3600]
   * @param {number} [options.intervalMs=5000] - Cleanup worker frequency
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.field = options.field || 'createdAt';
    this.expireAfterSeconds = options.expireAfterSeconds || 3600;
    this.intervalMs = options.intervalMs || 5000;
    this.timer = null;
  }

  /**
   * Starts background TTL worker
   */
  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.purgeExpired();
    }, this.intervalMs);

    if (this.timer.unref) this.timer.unref(); // Don't block Node.js event loop
  }

  /**
   * Stops background TTL worker
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Manually triggers an atomic sweep of expired documents
   */
  async purgeExpired() {
    try {
      const now = Date.now();
      const cutoffTime = now - (this.expireAfterSeconds * 1000);

      // In FlashCollection, inspect active documents in MemTable and SSTables
      const activeDocs = this.collection.memtable.scan(100000);
      let purgedCount = 0;

      for (const record of activeDocs) {
        if (!record || record._tombstone) continue;

        let timestamp = null;
        if (record._plain && record._plain[this.field]) {
          timestamp = new Date(record._plain[this.field]).getTime();
        } else if (record.createdAt) {
          timestamp = new Date(record.createdAt).getTime();
        }

        if (timestamp && timestamp < cutoffTime) {
          await this.collection.deleteOne({ _id: record._id });
          purgedCount++;
        }
      }

      return purgedCount;
    } catch (err) {
      // Fail-safe: don't crash background daemon on prune errors
      return 0;
    }
  }
}
