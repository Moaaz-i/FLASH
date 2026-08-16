/**
 * FLASH Bulk Write Batch Engine (FlashBulkWriter)
 * Executes heterogeneous mutation batches (insertOne, updateOne, updateMany, deleteOne, deleteMany, replaceOne)
 * with ordered & unordered execution modes
 */
export class FlashBulkWriter {
  /**
   * Executes a bulk write operations array
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   * @param {Array<object>} operations
   * @param {object} [options]
   * @param {boolean} [options.ordered=true]
   */
  static async execute(collection, operations = [], options = {}) {
    const ordered = options.ordered !== false;
    const result = {
      insertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
      insertedIds: {},
      upsertedIds: {},
      errors: []
    };

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        if (op.insertOne) {
          const doc = op.insertOne.document;
          const res = await collection.insertOne(doc);
          result.insertedCount++;
          result.insertedIds[i] = res.insertedId;
        } else if (op.updateOne) {
          const { filter, update, upsert } = op.updateOne;
          const res = await collection.updateOne(filter, update, { upsert });
          result.matchedCount += res.matchedCount;
          if (res.upsertedId) {
            result.upsertedCount++;
            result.upsertedIds[i] = res.upsertedId;
          } else {
            result.modifiedCount += res.modifiedCount;
          }
        } else if (op.updateMany) {
          const { filter, update, upsert } = op.updateMany;
          const res = await collection.updateMany(filter, update, { upsert });
          result.matchedCount += res.matchedCount;
          result.modifiedCount += res.modifiedCount;
        } else if (op.deleteOne) {
          const res = await collection.deleteOne(op.deleteOne.filter);
          result.deletedCount += res.deletedCount;
        } else if (op.deleteMany) {
          const res = await collection.deleteMany(op.deleteMany.filter);
          result.deletedCount += res.deletedCount;
        } else if (op.replaceOne) {
          const { filter, replacement, upsert } = op.replaceOne;
          const res = await collection.updateOne(filter, replacement, { upsert });
          result.matchedCount += res.matchedCount;
          result.modifiedCount += res.modifiedCount;
        }
      } catch (err) {
        result.errors.push({ index: i, error: err.message, op });
        if (ordered) {
          throw new Error(`BulkWriteError: Operation failed at index ${i}: ${err.message}`);
        }
      }
    }

    return result;
  }
}
