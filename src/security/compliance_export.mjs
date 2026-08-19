import crypto from "node:crypto";

/**
 * GDPR-style compliance export and delete attestation.
 */
export class FlashComplianceExport {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
  }

  async exportSubjectData(collectionName, subjectFilter) {
    const col = this.client.collection(collectionName);
    const docs = await col.find(subjectFilter).exec();
    return {
      engine: "FLASH",
      type: "gdpr_subject_export",
      exportedAt: Date.now(),
      collection: collectionName,
      recordCount: docs.length,
      records: docs,
    };
  }

  async eraseSubjectData(collectionName, subjectFilter, actor = "dpo") {
    const col = this.client.collection(collectionName);
    const docs = await col.find(subjectFilter).exec();
    let deleted = 0;
    for (const doc of docs) {
      const res = await col.deleteOne({ _id: doc._id });
      deleted += res.deletedCount;
    }

    const attestation = {
      engine: "FLASH",
      type: "gdpr_delete_attestation",
      actor,
      collection: collectionName,
      deletedCount: deleted,
      timestamp: Date.now(),
      filter: subjectFilter,
    };

    attestation.signature = crypto
      .createHmac("sha256", this.client.secretKey)
      .update(JSON.stringify(attestation))
      .digest("hex");

    return attestation;
  }
}
