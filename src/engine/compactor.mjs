import fs from "node:fs";
import path from "node:path";
import { FlashSSTable, fsyncDir } from "./sstable.mjs";
import { mergeSSTableFiles } from "./compaction_merge.mjs";
import { FlashWorkerPool } from "./worker_pool.mjs";
import { logger } from "../core/logger.mjs";

/**
 * Leveled LSM compaction: merge L(n) when table count exceeds threshold, promote to L(n+1).
 */
export class FlashCompactor {
  constructor(options = {}) {
    this.maxL0Tables = options.maxL0Tables || 4;
    this.maxLevelTables = options.maxLevelTables || 4;
    this.compactionIntervalMs = options.compactionIntervalMs || 30000;
    this.useWorkers = options.useWorkers !== false;
    this.workerPool = options.workerPool || FlashWorkerPool.getDefault();
    this.isRunning = false;
    this._timer = null;
  }

  start(collections = []) {
    if (this.isRunning) return;
    this.isRunning = true;
    this._timer = setInterval(async () => {
      for (const col of collections) {
        try {
          await this.compactCollection(col);
        } catch (err) {
          logger.error("FlashCompactor", "compaction error", {
            collection: col.name,
            error: err.message,
          });
        }
      }
    }, this.compactionIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _groupByLevel(collection) {
    const groups = new Map();
    for (const sst of collection.sstables) {
      const level = sst.level || 0;
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(sst);
    }
    return groups;
  }

  async compactCollection(collection, options = {}) {
    if (!collection?.storageDir || !fs.existsSync(collection.storageDir)) {
      return { compacted: false, originalFiles: 0, totalRecordsMerged: 0 };
    }

    const groups = this._groupByLevel(collection);
    let compacted = false;
    let totalMerged = 0;

    for (const [level, tables] of [...groups.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const threshold = options.force
        ? 2
        : level === 0
          ? this.maxL0Tables
          : this.maxLevelTables;
      if (tables.length < threshold) continue;

      const files = tables.map((t) => path.basename(t.filePath));
      const merged = await this._mergeTables(
        collection.storageDir,
        tables,
        level + 1,
      );
      if (merged.compacted) {
        compacted = true;
        totalMerged += merged.count || 0;
        for (const file of files) {
          try {
            await fs.promises.unlink(path.join(collection.storageDir, file));
          } catch {}
        }
        await fsyncDir(collection.storageDir);
      }
    }

    return {
      compacted,
      originalFiles: collection.sstables.length,
      totalRecordsMerged: totalMerged,
    };
  }

  async _mergeTables(dir, tables, targetLevel) {
    const filePaths = tables.map((t) => t.filePath);
    for (const sst of tables) {
      await sst.close();
    }

    if (this.useWorkers) {
      return this.workerPool.runMerge(dir, filePaths, targetLevel);
    }
    return mergeSSTableFiles(dir, filePaths, targetLevel);
  }
}
