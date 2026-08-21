import fs from "node:fs";
import path from "node:path";
import { FlashSSTable } from "./sstable.mjs";
import { FlashBinary } from "../binary/flash_binary.mjs";

/**
 * Shared SSTable merge logic (main thread + worker threads).
 * @param {string} dir
 * @param {string[]} filePaths
 * @param {number} targetLevel
 */
export async function mergeSSTableFiles(dir, filePaths, targetLevel) {
  const mergedEntries = new Map();

  for (const filePath of filePaths) {
    const sstable = new FlashSSTable(filePath);
    await sstable.load();
    for (const [key] of sstable.indexMap.entries()) {
      const valBuf = await sstable.get(key);
      if (!valBuf) continue;

      let isDeleted = false;
      try {
        isDeleted = FlashBinary.getField(valBuf, "_deleted") === true;
      } catch {
        try {
          const parsed = JSON.parse(valBuf.toString("utf8"));
          isDeleted = parsed._deleted === true;
        } catch {
          isDeleted = false;
        }
      }

      if (isDeleted) {
        mergedEntries.delete(key);
      } else {
        mergedEntries.set(key, valBuf);
      }
    }
    await sstable.close();
  }

  if (mergedEntries.size === 0) {
    return { compacted: false, path: null, count: 0 };
  }

  const sorted = Array.from(mergedEntries.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ key, value }));

  const outPath = path.join(
    dir,
    `sstable_L${targetLevel}_${Date.now()}_merged.sst`,
  );
  await FlashSSTable.write(outPath, sorted, { level: targetLevel });

  return { compacted: true, path: outPath, count: sorted.length };
}

/**
 * Flush memtable entries to SSTable inside a worker context.
 * @param {string} sstPath
 * @param {Array<{ key: string, value: Buffer|string }>} entries
 * @param {number} [level=0]
 */
export async function flushEntriesToSSTable(sstPath, entries, level = 0) {
  const normalized = entries.map((entry) => ({
    key: entry.key,
    value: Buffer.isBuffer(entry.value)
      ? entry.value
      : Buffer.from(entry.value),
  }));
  await FlashSSTable.write(sstPath, normalized, { level });
  return { path: sstPath, count: normalized.length };
}

/**
 * Ensure spill directory exists and return path.
 * @param {string} baseDir
 */
export function createSpillDir(baseDir) {
  const spillDir = path.join(baseDir, ".agg_spill", String(Date.now()));
  fs.mkdirSync(spillDir, { recursive: true });
  return spillDir;
}

/**
 * Remove spill directory recursively.
 * @param {string} spillDir
 */
export async function cleanupSpillDir(spillDir) {
  if (spillDir && fs.existsSync(spillDir)) {
    await fs.promises.rm(spillDir, { recursive: true, force: true });
  }
}
