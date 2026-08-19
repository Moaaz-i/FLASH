import crypto from "node:crypto";
import { FlashCRDTSync } from "../plugins/crdt_sync_plugin.mjs";

/**
 * Encrypted collection sync via LWW-CRDT merge (multi-master).
 */
export class FlashEncryptedCRDT {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} collectionName
   * @param {string} [nodeId]
   */
  constructor(client, collectionName, nodeId = null) {
    this.client = client;
    this.col = client.collection(collectionName);
    this.crdt = new FlashCRDTSync(nodeId);
  }

  async localWrite(doc) {
    const id = String(doc._id || crypto.randomUUID());
    doc._id = id;
    await this.col.insertOne(doc);
    return this.crdt.setLocal(id, doc);
  }

  async localDelete(docId) {
    await this.col.deleteOne({ _id: docId });
    return this.crdt.setLocal(String(docId), null, true);
  }

  exportDelta() {
    return [...this.crdt.state.values()];
  }

  async applyRemoteDelta(remoteEntry) {
    const result = this.crdt.mergeRemoteDelta(remoteEntry);
    if (result.applied) {
      if (remoteEntry.isTombstone) {
        await this.col.deleteOne({ _id: remoteEntry.docId });
      } else if (remoteEntry.doc) {
        const existing = await this.col.findOne({ _id: remoteEntry.docId });
        if (existing) await this.col.deleteOne({ _id: remoteEntry.docId });
        await this.col.insertOne(remoteEntry.doc);
      }
    }
    return result;
  }

  getActiveDocuments() {
    return this.crdt.getActiveDocuments();
  }
}
