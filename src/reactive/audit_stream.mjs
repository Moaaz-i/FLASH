import { FlashAuditVault } from "../security/audit_vault.mjs";
import { FlashChangeStream } from "../reactive/change_stream.mjs";

/**
 * Change stream + tamper-proof audit chain combined.
 */
export class FlashAuditStream {
  /**
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   * @param {object} [options]
   * @param {string} [options.vaultSecret]
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.audit = new FlashAuditVault(options.vaultSecret);
    this.stream = null;
  }

  watch(actor = "system") {
    this.stream = this.collection.watch();
    this.stream.on("change", (event) => {
      this.audit.log(actor, event.operationType?.toUpperCase() || "CHANGE", this.collection.name, {
        docId: event.id || event.doc?._id,
        ts: Date.now(),
      });
    });
    return this;
  }

  getAuditTrail() {
    return this.audit.chain;
  }

  verify() {
    return this.audit.verifyChain();
  }

  close() {
    this.stream?.close();
  }
}
