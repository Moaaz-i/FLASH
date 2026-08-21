/**
 * In-memory change-stream oplog — no filesystem persistence.
 */
export class MemoryOplog {
  constructor() {
    this.seq = 0;
  }

  async open() {}

  async sync() {}

  async append() {
    this.seq += 1;
  }

  async appendBatch(entries = []) {
    this.seq += entries.length;
  }

  async close() {}
}
