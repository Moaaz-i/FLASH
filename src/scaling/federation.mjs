/**
 * FLASH Multi-Database Federation Engine (FlashFederation)
 * Virtual collections spanning multiple heterogeneous or remote database clusters with scatter-gather queries.
 */
export class FlashFederation {
  constructor() {
    // dbName -> FlashDatabase
    this.members = new Map();
  }

  /**
   * Registers a database node into the federation
   * @param {string} name
   * @param {import('../core/database.mjs').FlashDatabase} dbInstance
   */
  registerMember(name, dbInstance) {
    this.members.set(name, dbInstance);
  }

  /**
   * Executes a scatter-gather query across all federated databases for a given collection
   * @param {string} collectionName
   * @param {object} queryEnvelope
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async federatedFind(collectionName, queryEnvelope = {}, options = {}) {
    const promises = [];

    for (const [name, db] of this.members.entries()) {
      promises.push((async () => {
        try {
          const col = db.collection(collectionName);
          await col.init();
          const docs = await col.find(queryEnvelope, options);
          return docs.map(d => ({ ...d, _federationSource: name }));
        } catch {
          return [];
        }
      })());
    }

    const resultsArray = await Promise.all(promises);
    const combined = resultsArray.flat();

    const limit = options.limit || Infinity;
    const skip = options.skip || 0;

    return combined.slice(skip, skip + limit);
  }
}
