/**
 * Stable cursor pagination for any sorted collection query.
 */
export class FlashPaginator {
  static encodeCursor(doc, sortSpec = { _id: 1 }) {
    const sortKey = Object.keys(sortSpec)[0] || "_id";
    const payload = {
      k: sortKey,
      v: doc[sortKey],
      id: String(doc._id),
    };
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }

  static decodeCursor(cursor) {
    if (!cursor) return null;
    try {
      return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  static _compareValues(a, b, dir) {
    if (a === b) return 0;
    if (a == null) return dir === 1 ? -1 : 1;
    if (b == null) return dir === 1 ? 1 : -1;
    if (a < b) return dir === 1 ? -1 : 1;
    if (a > b) return dir === 1 ? 1 : -1;
    return 0;
  }

  static applyCursor(docs, cursor, sortSpec = { _id: 1 }) {
    if (!cursor) return docs;
    const sortKey = cursor.k || Object.keys(sortSpec)[0] || "_id";
    const dir = sortSpec[sortKey] ?? 1;

    let start = 0;
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const cmp = this._compareValues(doc[sortKey], cursor.v, dir);
      if (cmp > 0) {
        start = i;
        break;
      }
      if (cmp === 0 && String(doc._id) > String(cursor.id)) {
        start = i;
        break;
      }
      start = i + 1;
    }
    return docs.slice(start);
  }

  /**
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   */
  static async paginate(collection, query = {}, options = {}) {
    const sort = options.sort || { _id: 1 };
    const limit = Math.max(1, options.limit ?? 20);
    const cursor = options.cursor ? this.decodeCursor(options.cursor) : null;

    let docs = await collection.find(query).sort(sort).exec();
    docs = this.applyCursor(docs, cursor, sort);

    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? this.encodeCursor(page[page.length - 1], sort)
        : null;

    return { docs: page, nextCursor, hasMore };
  }
}
