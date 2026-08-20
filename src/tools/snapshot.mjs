import { FlashPortableBundle } from "./portable_bundle.mjs";

/**
 * Checkpoint / restore wrapper over encrypted portable bundles.
 */
export class FlashSnapshot {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
    this.bundle = new FlashPortableBundle(client);
  }

  async exportTo(filePath, collectionNames = null) {
    const names =
      collectionNames ??
      (this.client.db.listCollections
        ? this.client.db.listCollections()
        : []);
    return this.bundle.exportToFile(names, filePath);
  }

  async importFrom(filePath) {
    return FlashPortableBundle.importFromFile(filePath, this.client);
  }
}
