import { FlashBrowserAdapter } from "./browser_adapter.mjs";
import { FlashCipher } from "../crypto/cipher.mjs";

/**
 * Browser-local encrypted vault using in-memory / IndexedDB-ready adapter.
 */
export class FlashBrowserVault {
  /**
   * @param {string} secretKey
   * @param {string} [vaultName='browser_vault']
   */
  constructor(secretKey, vaultName = "browser_vault") {
    this.cipher = new FlashCipher(secretKey);
    this.adapter = new FlashBrowserAdapter(vaultName, { driver: "memory" });
    this.collection = "records";
  }

  async put(key, value) {
    const plain = JSON.stringify(value);
    const enc = this.cipher.encrypt(plain, { aad: `browser:${key}` });
    await this.adapter.set(this.collection, key, Buffer.from(enc, "utf-8"));
    return true;
  }

  async get(key) {
    const encBuf = await this.adapter.get(this.collection, key);
    if (!encBuf) return null;
    const enc = encBuf.toString("utf-8");
    const plain = this.cipher.decrypt(enc, { aad: `browser:${key}` });
    return JSON.parse(plain);
  }

  async list() {
    return this.adapter.listKeys(this.collection);
  }

  async remove(key) {
    return this.adapter.delete(this.collection, key);
  }
}
