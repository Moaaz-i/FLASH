import fs from 'node:fs';
import path from 'node:path';
import { FlashSSTable, fsyncDir } from './sstable.mjs';
import { logger } from '../core/logger.mjs';

/**
 * FLASH Background LSM-Tree Compactor Engine (FlashCompactor)
 * Merges multi-tiered SSTables, evicts expired TTL and Tombstone records,
 * and defragments storage files to prevent Disk Bloat.
 */

export class FlashCompactor {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSSTablesBeforeCompact=4]
   * @param {number} [options.compactionIntervalMs=30000]
   */
  constructor(options = {}) {
    this.maxSSTablesBeforeCompact = options.maxSSTablesBeforeCompact || 4;
    this.compactionIntervalMs = options.compactionIntervalMs || 30000;
    this.isRunning = false;
    this._timer = null;
  }

  /**
   * Starts background compaction loop
   * @param {Array<import('../core/collection.mjs').FlashCollection>} collections
   */
  start(collections = []) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('FlashCompactor', 'background compaction started', {
      intervalMs: this.compactionIntervalMs,
      collections: collections.length,
    });
    this._timer = setInterval(async () => {
      for (const col of collections) {
        try {
          await this.compactCollection(col);
        } catch (err) {
          logger.error('FlashCompactor', 'compaction error', {
            collection: col.name,
            error: err.message,
          });
        }
      }
    }, this.compactionIntervalMs);
  }

  /**
   * Stops background compaction
   */
  stop() {
    this.isRunning = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Performs compaction on a single collection
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @returns {Promise<{ compacted: boolean, originalFiles: number, totalRecordsMerged: number }>}
   */
  async compactCollection(collection) {
    if (!collection || !collection.storageDir) {
      return { compacted: false, originalFiles: 0, totalRecordsMerged: 0 };
    }

    const dir = collection.storageDir;
    if (!fs.existsSync(dir)) {
      return { compacted: false, originalFiles: 0, totalRecordsMerged: 0 };
    }

    const files = (await fs.promises.readdir(dir))
      .filter(f => f.endsWith('.sst') && !f.includes('compacted_temp'))
      .sort();

    if (files.length < 2) {
      return { compacted: false, originalFiles: files.length, totalRecordsMerged: 0 };
    }

    const t0 = Date.now();

    // Read all records across existing SSTables in chronological order
    const mergedEntries = new Map(); // key -> Buffer (latest version survives)

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const sstable = new FlashSSTable(filePath);
        await sstable.load();

        for (const [key] of sstable.indexMap.entries()) {
          const valBuf = await sstable.get(key);
          if (valBuf) {
            try {
              const parsed = JSON.parse(valBuf.toString('utf8'));
              // If tombstone/deleted record, mark to remove unless written earlier
              if (parsed._deleted === true) {
                mergedEntries.delete(key);
              } else {
                mergedEntries.set(key, valBuf);
              }
            } catch {
              mergedEntries.set(key, valBuf);
            }
          }
        }
      } catch (err) {
        logger.warn('FlashCompactor', 'failed to read SSTable during compaction', {
          collection: collection.name,
          file,
          error: err.message,
        });
      }
    }

    // Sort entries by key
    const sorted = Array.from(mergedEntries.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ key, value }));

    const tempCompactedPath = path.join(dir, `compacted_temp_${Date.now()}.sst`);
    const finalCompactedPath = path.join(dir, `sstable_level1_${Date.now()}.sst`);

    // FlashSSTable.write already performs an atomic durable write (temp -> fsync -> rename -> fsyncDir).
    await FlashSSTable.write(finalCompactedPath, sorted);

    // Remove old sst files that were merged
    for (const file of files) {
      const oldPath = path.join(dir, file);
      try {
        await fs.promises.unlink(oldPath);
      } catch {}
    }

    // Ensure directory entries (new file + unlinks) are durable before returning
    await fsyncDir(dir);

    const durationMs = Date.now() - t0;
    logger.info('FlashCompactor', 'compaction completed', {
      collection: collection.name,
      originalFiles: files.length,
      mergedRecords: sorted.length,
      durationMs,
    });

    return {
      compacted: true,
      originalFiles: files.length,
      totalRecordsMerged: sorted.length,
    };
  }
}
