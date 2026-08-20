import { FlashCompactor } from "./compactor.mjs";
import { logger } from "../core/logger.mjs";

/**
 * Background maintenance: lifecycle sweeps, memtable flush, LSM compaction.
 */
export class FlashMaintenance {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {object} [options]
   * @param {number} [options.sweepIntervalMs=60000]
   * @param {number} [options.flushIntervalMs=300000]
   * @param {number} [options.compactIntervalMs=1800000]
   */
  constructor(client, options = {}) {
    this.client = client;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
    this.flushIntervalMs = options.flushIntervalMs ?? 300_000;
    this.compactIntervalMs = options.compactIntervalMs ?? 1_800_000;
    this.compactor = new FlashCompactor({
      compactionIntervalMs: this.compactIntervalMs,
    });
    this._timers = [];
    this._running = false;
  }

  _rawCollections() {
    const db = this.client.db;
    if (!db?.collections) return [];
    return Array.from(db.collections.values());
  }

  async _runLifecycle() {
    const lifecycles = this.client._lifecycles;
    if (!lifecycles?.size) return;
    for (const lc of lifecycles.values()) {
      try {
        await lc.sweep();
      } catch (err) {
        logger.warn("FlashMaintenance", "lifecycle sweep failed", {
          error: err.message,
        });
      }
    }
  }

  async _runFlush() {
    for (const raw of this._rawCollections()) {
      try {
        if (raw.memtable?.byteSize > 0) {
          await raw.flush();
        }
      } catch (err) {
        logger.warn("FlashMaintenance", "flush failed", {
          collection: raw.name,
          error: err.message,
        });
      }
    }
  }

  start() {
    if (this._running) return this;
    this._running = true;

    const sweepTimer = setInterval(() => {
      this._runLifecycle().catch(() => {});
    }, this.sweepIntervalMs);
    if (sweepTimer.unref) sweepTimer.unref();
    this._timers.push(sweepTimer);

    const flushTimer = setInterval(() => {
      this._runFlush().catch(() => {});
    }, this.flushIntervalMs);
    if (flushTimer.unref) flushTimer.unref();
    this._timers.push(flushTimer);

    this.compactor.start(this._rawCollections());
    return this;
  }

  stop() {
    this._running = false;
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
    this.compactor.stop();
  }

  /** Run all maintenance tasks immediately. */
  async runNow() {
    await this._runLifecycle();
    await this._runFlush();
    for (const raw of this._rawCollections()) {
      await this.compactor.compactCollection(raw);
    }
  }
}
