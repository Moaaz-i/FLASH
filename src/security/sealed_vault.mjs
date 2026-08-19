import crypto from "node:crypto";
import { FlashClient } from "../client/flash_client.mjs";

/**
 * Passphrase-sealed encrypted vault — separate key domain from the main client.
 * Auto-locks after inactivity. For credentials, keys, and ultra-sensitive records.
 */
export class FlashSealedVault {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} vaultName
   * @param {object} [options]
   * @param {number} [options.autoLockMs=300000]
   */
  constructor(client, vaultName, options = {}) {
    this.client = client;
    this.vaultName = vaultName;
    this.autoLockMs = options.autoLockMs ?? 300_000;
    this.unlocked = false;
    this._vaultClient = null;
    this._col = null;
    this._lockTimer = null;
  }

  get isLocked() {
    return !this.unlocked;
  }

  /**
   * Derive an isolated client key domain from master key + passphrase.
   */
  unlock(passphrase) {
    if (!passphrase)
      throw new Error("Passphrase required to unlock sealed vault");
    const derivedKey = crypto
      .scryptSync(
        `${this.client.secretKey}:${passphrase}`,
        `flash-sealed-${this.vaultName}`,
        32,
      )
      .toString("hex");

    const basePath =
      this.client.db?.storagePath ||
      this.client.config?.storagePath ||
      "./data";

    this._vaultClient = new FlashClient({
      secretKey: derivedKey,
      storagePath: basePath,
      dbName: `flash_vault_${this.vaultName}`,
    });
    this._col = this._vaultClient.collection("records");
    this.unlocked = true;
    this._armAutoLock();
  }

  lock() {
    this.unlocked = false;
    this._vaultClient = null;
    this._col = null;
    if (this._lockTimer) {
      clearTimeout(this._lockTimer);
      this._lockTimer = null;
    }
  }

  _requireUnlocked() {
    if (!this.unlocked || !this._col) {
      throw new Error("Sealed vault is locked — call unlock(passphrase) first");
    }
  }

  _armAutoLock() {
    if (this._lockTimer) clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => this.lock(), this.autoLockMs);
  }

  _touch() {
    if (this.unlocked) this._armAutoLock();
  }

  async put(recordId, payload) {
    this._requireUnlocked();
    this._touch();
    await this._col.init();
    const existing = await this._col.findOne({ _id: recordId });
    if (existing) {
      await this._col.deleteOne({ _id: recordId });
    }
    return this._col.insertOne({ _id: recordId, ...payload });
  }

  async get(recordId) {
    this._requireUnlocked();
    this._touch();
    return this._col.findOne({ _id: recordId });
  }

  async list() {
    this._requireUnlocked();
    this._touch();
    return this._col.find({}).exec();
  }

  async remove(recordId) {
    this._requireUnlocked();
    this._touch();
    return this._col.deleteOne({ _id: recordId });
  }

  async close() {
    this.lock();
    if (this._vaultClient) await this._vaultClient.close();
  }
}
