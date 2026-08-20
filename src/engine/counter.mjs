/**
 * Named numeric counter with read-modify-write semantics.
 */
export class FlashCounter {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} name
   * @param {object} [options]
   * @param {string} [options.namespace='_flash_counters']
   */
  constructor(client, name, options = {}) {
    this.client = client;
    this.name = String(name);
    this.col = client.collection(options.namespace || "_flash_counters");
  }

  async get() {
    await this.col.init();
    const doc = await this.col.findOne({ _id: this.name });
    return doc?.value ?? 0;
  }

  async increment(by = 1) {
    await this.col.init();
    const existing = await this.col.findOne({ _id: this.name });
    if (!existing) {
      await this.col.insertOne({ _id: this.name, value: by });
      return by;
    }
    const next = (Number(existing.value) || 0) + by;
    await this.col.updateOne({ _id: this.name }, { $set: { value: next } });
    return next;
  }

  async decrement(by = 1) {
    return this.increment(-by);
  }

  async set(value) {
    await this.col.init();
    await this.col.updateOne(
      { _id: this.name },
      { $set: { value: Number(value) || 0 } },
      { upsert: true },
    );
    return Number(value) || 0;
  }

  async reset(value = 0) {
    return this.set(value);
  }
}
