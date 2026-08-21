import {
  DEFAULT_MEMTABLE_THRESHOLD,
  DEFAULT_DURABILITY,
} from "./perf_defaults.mjs";

/** @typedef {'strict' | 'balanced' | 'turbo'} FlashPerformanceProfile */

export const TURBO_MEMTABLE_THRESHOLD = 64 * 1024 * 1024; // 64 MB

/**
 * Merges user engineOptions with a performance profile preset.
 * @param {object} [userOptions={}]
 * @returns {object}
 */
export function resolveEngineOptions(userOptions = {}) {
  const profile = userOptions.performanceProfile || "balanced";
  const storageProfile = userOptions.storageProfile || "standard";
  const overrides = { ...userOptions };
  delete overrides.performanceProfile;
  delete overrides.storageProfile;

  const compressionLevel =
    overrides.compressionLevel ??
    (storageProfile === "compact" ? 6 : 1);

  if (profile === "turbo") {
    return {
      durability: "throughput",
      memtableThreshold: TURBO_MEMTABLE_THRESHOLD,
      useWorkerFlush: true,
      deferMerkleOnWrite: true,
      disableMerkle: overrides.disableMerkle !== false,
      compressionLevel,
      storageProfile,
      ...overrides,
      performanceProfile: "turbo",
    };
  }

  if (profile === "strict") {
    return {
      durability: "strict",
      memtableThreshold: DEFAULT_MEMTABLE_THRESHOLD,
      useWorkerFlush: false,
      deferMerkleOnWrite: false,
      disableMerkle: false,
      compressionLevel,
      storageProfile,
      ...overrides,
      performanceProfile: "strict",
    };
  }

  return {
    durability: DEFAULT_DURABILITY,
    memtableThreshold: DEFAULT_MEMTABLE_THRESHOLD,
    useWorkerFlush: true,
    deferMerkleOnWrite: true,
    disableMerkle: false,
    compressionLevel,
    storageProfile,
    ...overrides,
    performanceProfile: "balanced",
  };
}
