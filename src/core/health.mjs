/**
 * Database health and capacity snapshot.
 */
export class FlashHealth {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
  }

  async report() {
    if (this.client.uri) {
      return {
        status: "remote",
        mode: "client-server",
        uri: this.client.uri,
      };
    }

    const names = this.client.db.listCollections
      ? this.client.db.listCollections()
      : [];

    let totalDocuments = 0;
    let memtableBytes = 0;
    let sstables = 0;

    for (const name of names) {
      const raw = this.client.db.collection(name);
      if (!raw.isReady) await raw.init();
      totalDocuments += await raw.count();
      memtableBytes += raw.memtable?.byteSize ?? 0;
      sstables += raw.sstables?.length ?? 0;
    }

    return {
      status: "ok",
      mode: "embedded",
      dbName: this.client.db.dbName,
      collections: names.length,
      totalDocuments,
      memtableBytes,
      sstables,
      lifecycles: this.client._lifecycles?.size ?? 0,
      plugins: this.client.plugins?.plugins?.length ?? 0,
    };
  }
}
