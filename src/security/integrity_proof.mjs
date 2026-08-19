import crypto from "node:crypto";

/**
 * Export cryptographic integrity proofs for compliance and audit.
 * Merkle root + invariant report + signed manifest — FLASH trust envelope.
 */
export class FlashIntegrityProof {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} collectionName
   * @param {object} [options]
   * @param {string} [options.actor='system']
   */
  static async export(client, collectionName, options = {}) {
    const col = client.collection(collectionName);
    await col.init();

    const merkleRoot = col.raw.getMerkleRoot();
    const invariants = await col.raw.verifyInvariants();
    const timestamp = Date.now();
    const actor = options.actor || "system";

    const payload = {
      engine: "FLASH",
      proofVersion: 1,
      collection: collectionName,
      timestamp,
      actor,
      merkleRoot,
      invariants: {
        valid: invariants.valid,
        activeDocs: invariants.activeDocs,
        registeredIds: invariants.registeredIds,
        sstables: invariants.sstables,
      },
    };

    const signature = crypto
      .createHmac("sha256", client.secretKey)
      .update(JSON.stringify(payload))
      .digest("hex");

    return { ...payload, signature };
  }

  /**
   * @param {object} proof
   * @param {string} secretKey
   */
  static verify(proof, secretKey) {
    const { signature, ...payload } = proof;
    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(JSON.stringify(payload))
      .digest("hex");
    return expected === signature;
  }
}
