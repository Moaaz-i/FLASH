/**
 * FIFO priority queue backed by a collection.
 */
export class FlashQueue {
  /**
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   * @param {object} [options]
   * @param {string} [options.statusField='status']
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.statusField = options.statusField || "status";
  }

  async enqueue(payload, options = {}) {
    const doc = {
      payload,
      [this.statusField]: "pending",
      priority: options.priority ?? 0,
      createdAt: new Date(),
      attempts: 0,
    };
    const res = await this.collection.insertOne(doc);
    return { id: res.insertedId, ...doc };
  }

  async dequeue() {
    await this.collection.init();
    const items = await this.collection
      .find({ [this.statusField]: "pending" })
      .sort({ priority: -1, createdAt: 1 })
      .limit(1)
      .exec();
    if (items.length === 0) return null;
    const item = items[0];
    await this.collection.updateOne(
      { _id: item._id },
      {
        $set: {
          [this.statusField]: "processing",
          startedAt: new Date(),
          attempts: (item.attempts || 0) + 1,
        },
      },
    );
    return { ...item, status: "processing" };
  }

  async ack(id) {
    await this.collection.updateOne(
      { _id: id },
      { $set: { [this.statusField]: "done", finishedAt: new Date() } },
    );
  }

  async fail(id, error = "failed") {
    await this.collection.updateOne(
      { _id: id },
      {
        $set: {
          [this.statusField]: "pending",
          lastError: String(error),
          failedAt: new Date(),
        },
      },
    );
  }

  async depth() {
    return this.collection.count({ [this.statusField]: "pending" });
  }
}
