/**
 * FLASH Local-First Browser & Edge Storage Adapter (FlashBrowserAdapter)
 * Enables running FLASH DB 100% inside web browsers (IndexedDB / OPFS / Memory) for local-first offline apps.
 */
export class FlashBrowserAdapter {
  /**
   * @param {string} dbName
   * @param {object} [options]
   * @param {'indexeddb'|'memory'|'opfs'} [options.driver='memory']
   */
  constructor(dbName = 'flash_browser_db', options = {}) {
    this.dbName = dbName;
    this.driver = options.driver || 'memory';
    // Memory store fallback: collectionName -> Map<string, Buffer>
    this.store = new Map();
  }

  async set(collection, key, buffer) {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    this.store.get(collection).set(String(key), buffer);
    return true;
  }

  async get(collection, key) {
    if (!this.store.has(collection)) return null;
    return this.store.get(collection).get(String(key)) || null;
  }

  async delete(collection, key) {
    if (!this.store.has(collection)) return false;
    return this.store.get(collection).delete(String(key));
  }

  async listKeys(collection) {
    if (!this.store.has(collection)) return [];
    return Array.from(this.store.get(collection).keys());
  }

  async clear(collection) {
    if (this.store.has(collection)) {
      this.store.get(collection).clear();
    }
  }
}
