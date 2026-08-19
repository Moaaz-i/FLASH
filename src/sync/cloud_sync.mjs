import fs from "node:fs/promises";
import path from "node:path";
import { FlashPortableBundle } from "../tools/portable_bundle.mjs";

/**
 * Encrypted folder sync — push/pull `.flashpack` bundles to a cloud directory.
 * Provider-agnostic (Dropbox, iCloud, S3 mount, etc.).
 */
export class FlashCloudSync {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} syncDir - local cloud-synced folder path
   */
  constructor(client, syncDir) {
    this.client = client;
    this.syncDir = path.resolve(syncDir);
    this.bundle = new FlashPortableBundle(client);
  }

  async push(collectionNames, label = "default") {
    await fs.mkdir(this.syncDir, { recursive: true });
    const outFile = path.join(this.syncDir, `${label}_${Date.now()}.flashpack`);
    return this.bundle.exportToFile(collectionNames, outFile);
  }

  async pull(latest = true) {
    await fs.mkdir(this.syncDir, { recursive: true });
    const files = (await fs.readdir(this.syncDir))
      .filter((f) => f.endsWith(".flashpack"))
      .sort();
    if (files.length === 0) throw new Error("No flashpack bundles in sync dir");
    const file = path.join(this.syncDir, latest ? files[files.length - 1] : files[0]);
    return FlashPortableBundle.importFromFile(file, this.client);
  }

  async listBundles() {
    await fs.mkdir(this.syncDir, { recursive: true });
    return (await fs.readdir(this.syncDir)).filter((f) => f.endsWith(".flashpack"));
  }
}
