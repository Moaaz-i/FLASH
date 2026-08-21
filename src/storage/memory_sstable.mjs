/**
 * In-memory SSTable segment — Map-backed, compatible with FlashSSTable read API.
 */
export class MemorySSTable {
  /**
   * @param {number} [level=0]
   */
  constructor(level = 0) {
    this.level = level;
    this.filePath = ":memory:";
    this.indexMap = new Map();
    /** @type {Map<string, Buffer>} */
    this._data = new Map();
    this.isLoaded = true;
    this.bloomFilter = null;
    this.formatVersion = 2;
  }

  /**
   * @param {{ key: string, value: Buffer }[]} entries
   * @param {number} [level=0]
   */
  static fromEntries(entries, level = 0) {
    const sst = new MemorySSTable(level);
    const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
    for (const entry of sorted) {
      const val = Buffer.isBuffer(entry.value)
        ? entry.value
        : Buffer.from(
            typeof entry.value === "string"
              ? entry.value
              : JSON.stringify(entry.value),
          );
      sst.indexMap.set(entry.key, { blockId: 0, offset: 0, len: val.length });
      sst._data.set(entry.key, val);
    }
    return sst;
  }

  async load() {}

  async close() {}

  /**
   * @param {string} key
   * @returns {Promise<Buffer|null>}
   */
  async get(key) {
    return this._data.get(key) ?? null;
  }
}
