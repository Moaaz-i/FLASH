/**
 * FLASH Zero-Knowledge GraphQL Engine (FlashGraphQL)
 * Lightweight schema generator and query executor over encrypted collections.
 */
import { FlashBinary } from "../binary/flash_binary.mjs";

export class FlashGraphQL {
  /**
   * @param {import('../core/database.mjs').FlashDatabase} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Executes a GraphQL query string against collections
   * @param {string} queryStr - e.g. `{ users(limit: 10) { name email balance } }`
   * @returns {Promise<{ data: object, errors?: any[] }>}
   */
  async execute(queryStr) {
    const parsed = this._parse(queryStr);
    const data = {};

    for (const req of parsed) {
      const col = this.db.collection(req.collection);
      await col.init();

      const options = {};
      if (req.limit) options.limit = req.limit;

      const docs = FlashBinary.decodeRecords(
        await col.find(req.filter || {}, options),
      );

      // Project fields
      data[req.alias || req.collection] = docs.map(doc => {
        if (req.fields.length === 0 || req.fields.includes('*')) return doc;
        const out = {};
        for (const f of req.fields) {
          if (doc[f] !== undefined) out[f] = doc[f];
        }
        return out;
      });
    }

    return { data };
  }

  _parse(queryStr) {
    const clean = queryStr.replace(/\s+/g, ' ').trim();
    const reqs = [];

    // Simple GraphQL field matching: collectionName(arg: val) { f1 f2 }
    const regex = /([a-zA-Z0-9_]+)(?:\(([^)]+)\))?\s*\{([^}]+)\}/g;
    let match;

    while ((match = regex.exec(clean)) !== null) {
      const collection = match[1];
      const argsStr = match[2];
      const fieldsStr = match[3];

      let limit = null;
      if (argsStr) {
        const lm = argsStr.match(/limit\s*:\s*(\d+)/i);
        if (lm) limit = parseInt(lm[1], 10);
      }

      const fields = fieldsStr.trim().split(/\s+/).filter(Boolean);
      reqs.push({ collection, limit, fields });
    }

    return reqs;
  }
}
