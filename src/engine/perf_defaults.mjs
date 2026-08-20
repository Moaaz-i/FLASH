/** Engine performance defaults — tuned for throughput without sacrificing balanced durability. */

export const DEFAULT_MEMTABLE_THRESHOLD = 4 * 1024 * 1024; // 4 MB

/** @typedef {'strict' | 'balanced' | 'throughput'} FlashDurabilityMode */

/** @type {FlashDurabilityMode} */
export const DEFAULT_DURABILITY = "balanced";

export const BALANCED_SYNC_OPS = 64;
export const BALANCED_SYNC_MS = 25;

/** L0 SSTables before background compaction kicks in. */
export const L0_COMPACT_TRIGGER = 8;

/**
 * @param {FlashDurabilityMode | undefined} mode
 * @returns {{ syncOnWrite: boolean, batchSync: boolean, syncEveryOps: number, syncEveryMs: number }}
 */
export function resolveDurability(mode = DEFAULT_DURABILITY) {
  if (mode === "strict") {
    return {
      syncOnWrite: true,
      batchSync: false,
      syncEveryOps: 1,
      syncEveryMs: 0,
    };
  }
  if (mode === "throughput") {
    return {
      syncOnWrite: false,
      batchSync: false,
      syncEveryOps: 0,
      syncEveryMs: 0,
    };
  }
  return {
    syncOnWrite: false,
    batchSync: true,
    syncEveryOps: BALANCED_SYNC_OPS,
    syncEveryMs: BALANCED_SYNC_MS,
  };
}
