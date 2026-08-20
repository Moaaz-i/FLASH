import { FlashBinary } from "../binary/flash_binary.mjs";
import { FlashPaginator } from "./paginator.mjs";

/**
 * Append-only time-ordered event stream on any collection.
 * Works for audit logs, telemetry, position samples, chat messages, job events.
 */
export class FlashEventLog {
  /**
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   * @param {object} [options]
   * @param {string} [options.timeField='ts']
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.timeField = options.timeField || "ts";
  }

  async append(data = {}) {
    const doc = {
      ...data,
      [this.timeField]: data[this.timeField] ?? Date.now(),
    };
    const res = await this.collection.insertOne(doc);
    return { id: res.insertedId, ...doc };
  }

  async appendMany(items = []) {
    const docs = items.map((d) => ({
      ...d,
      [this.timeField]: d[this.timeField] ?? Date.now(),
    }));
    return this.collection.insertMany(docs);
  }

  /** Latest events first (tail of stream). */
  async tail(query = {}, options = {}) {
    return FlashPaginator.paginate(this.collection, query, {
      limit: options.limit ?? 50,
      cursor: options.cursor ?? null,
      sort: options.sort ?? { [this.timeField]: -1, _id: -1 },
    });
  }

  /** Events at or after timestamp / date. */
  async since(when, query = {}, options = {}) {
    const ts = when instanceof Date ? when.getTime() : Number(when);
    const merged = {
      ...query,
      [this.timeField]: { $gte: ts },
    };
    return this.collection
      .find(merged, { limit: options.limit ?? 1000 })
      .sort({ [this.timeField]: 1 })
      .exec();
  }
}
