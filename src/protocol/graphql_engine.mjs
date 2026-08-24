/**
 * FLASH Zero-Knowledge GraphQL Engine (FlashGraphQL)
 * Executes GraphQL-shaped queries through FlashClient so the engine never sees plaintext.
 */
import { FlashZKKernel } from "../crypto/zk_kernel.mjs";

export class FlashGraphQL {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = FlashZKKernel.requireClient(client, "FlashGraphQL");
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
      let cursor = this.client
        .collection(req.collection)
        .find(req.filter || {});
      if (req.limit) cursor = cursor.limit(req.limit);
      const docs = await cursor;

      data[req.alias || req.collection] = docs.map((doc) => {
        if (req.fields.length === 0 || req.fields.includes("*")) return doc;
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
    const clean = queryStr.replace(/\s+/g, " ").trim();
    const reqs = [];

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
