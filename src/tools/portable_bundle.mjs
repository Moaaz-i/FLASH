import fs from "node:fs/promises";
import path from "node:path";
import { FlashBackupManager } from "../engine/backup_restore.mjs";
import { FlashCipher } from "../crypto/cipher.mjs";

const BUNDLE_MAGIC = "FLASHPACK1";

/**
 * Encrypted portable `.flashpack` bundle — move intelligence data anywhere.
 */
export class FlashPortableBundle {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * @param {string[]} collectionNames
   * @param {string} outFile
   * @param {object} [extras] - e.g. { textCache: {...} } from EmbeddingVault
   */
  async exportToFile(collectionNames, outFile, extras = {}) {
    const storagePath = this.client.db.storagePath;
    const tmpDir = path.join(path.dirname(outFile), `.flashpack_${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const snapshot = await FlashBackupManager.backup(storagePath, tmpDir);
    const manifest = {
      magic: BUNDLE_MAGIC,
      engine: "FLASH",
      exportedAt: Date.now(),
      collections: collectionNames,
      dbName: this.client.db.dbName,
      snapshot,
      extras,
    };

    const cipher = new FlashCipher(this.client.secretKey, this.client.config.salt || "flash_db_default_salt_2026");
    const manifestEnc = cipher.encrypt(JSON.stringify(manifest), {
      aad: "flashpack:manifest",
    });
    await fs.writeFile(path.join(tmpDir, "manifest.flashenc"), manifestEnc, "utf-8");

    const packed = await this._packDir(tmpDir);
    await fs.writeFile(outFile, packed);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return { outFile, bytes: packed.length, collections: collectionNames.length };
  }

  /**
   * @param {string} bundleFile
   * @param {import('../client/flash_client.mjs').FlashClient} targetClient
   */
  static async importFromFile(bundleFile, targetClient) {
    const buf = await fs.readFile(bundleFile);
    const tmpDir = path.join(path.dirname(bundleFile), `.flashunpack_${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    await this._unpackToDir(buf, tmpDir);

    const manifestEnc = await fs.readFile(path.join(tmpDir, "manifest.flashenc"), "utf-8");
    const cipher = new FlashCipher(targetClient.secretKey, targetClient.config.salt || "flash_db_default_salt_2026");
    const manifestJson = cipher.decrypt(manifestEnc, {
      aad: "flashpack:manifest",
    });
    const manifest = JSON.parse(manifestJson);

    const targetPath = targetClient.db.storagePath;
    await FlashBackupManager.restore(tmpDir, targetPath);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return manifest;
  }

  async _packDir(dir) {
    const entries = [];
    async function walk(d, prefix = "") {
      const items = await fs.readdir(d, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(d, item.name);
        const rel = path.join(prefix, item.name);
        if (item.isDirectory()) await walk(full, rel);
        else {
          const data = await fs.readFile(full);
          entries.push({ path: rel, data: data.toString("base64") });
        }
      }
    }
    await walk(dir);
    return Buffer.from(JSON.stringify({ magic: BUNDLE_MAGIC, entries }), "utf-8");
  }

  static async _unpackToDir(buf, dir) {
    const resolvedDir = path.resolve(dir);
    const { entries } = JSON.parse(buf.toString("utf-8"));
    for (const e of entries) {
      const out = path.resolve(dir, e.path);
      if (!out.startsWith(resolvedDir)) {
        throw new Error(`Security Exception: Path traversal attempt blocked: ${e.path}`);
      }
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, Buffer.from(e.data, "base64"));
    }
  }
}
