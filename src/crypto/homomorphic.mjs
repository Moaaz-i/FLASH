import crypto from 'node:crypto';

/**
 * FLASH Homomorphic Crypto Engine (FlashHomomorphic)
 * Enables additive operations ($sum, $inc) directly over encrypted numerical values
 * Uses additive masked homomorphisms with high-throughput batching.
 */
export class FlashHomomorphic {
  /**
   * @param {string|Buffer} secretKey - Secret key for additive homomorphism
   */
  constructor(secretKey) {
    if (!secretKey) throw new Error('Homomorphic secret key required');
    this.key = Buffer.isBuffer(secretKey)
      ? secretKey
      : crypto.createHash('sha256').update(String(secretKey)).digest();
    // Large prime modulus for additive group arithmetic
    this.modulus = 2n ** 64n - 59n; // High-precision 64-bit safe prime
  }

  /**
   * Generates a deterministic pseudorandom mask for a record ID & field
   * @param {string} recordId
   * @param {string} fieldName
   * @param {number} [version=1]
   * @returns {bigint}
   */
  _deriveMask(recordId, fieldName, version = 1) {
    const h = crypto
      .createHmac('sha256', this.key)
      .update(`homo:${recordId}:${fieldName}:${version}`)
      .digest();
    const mask = h.readBigUInt64BE(0);
    return mask % this.modulus;
  }

  /**
   * Encrypts a number additively: C = (M + Mask) mod P
   * @param {number|bigint} value - Plaintext value
   * @param {string} recordId - Unique document id
   * @param {string} fieldName - Field name (e.g. "balance", "score")
   * @returns {{ ciphertext: string, maskHash: string }}
   */
  encryptAdd(value, recordId, fieldName) {
    const v = BigInt(Math.round(Number(value) * 100)); // Scaled to 2 decimal points
    const mask = this._deriveMask(recordId, fieldName);
    const encryptedVal = (v + mask) % this.modulus;
    const ciphertext = encryptedVal.toString(16);
    const tag = crypto
      .createHmac("sha256", this.key)
      .update(`homo-tag:${recordId}:${fieldName}:${ciphertext}`)
      .digest("hex")
      .slice(0, 32);

    return {
      ciphertext: `${ciphertext}.${tag}`,
      recordId,
      fieldName,
    };
  }

  /**
   * Aggregates multiple encrypted values on the server without decrypting: C_sum = Sum(C_i) mod P
   * @param {string[]} ciphertexts - Hex strings of encrypted values
   * @returns {string} Hex string of the aggregated ciphertext
   */
  _splitCiphertext(c) {
    const s = String(c);
    const dot = s.lastIndexOf(".");
    if (dot === -1) return { body: s, tag: null };
    return { body: s.slice(0, dot), tag: s.slice(dot + 1) };
  }

  aggregateSum(ciphertexts) {
    let sum = 0n;
    for (const c of ciphertexts) {
      if (typeof c === "string") {
        const { body } = this._splitCiphertext(c);
        const val = BigInt("0x" + body);
        sum = (sum + val) % this.modulus;
      }
    }
    return sum.toString(16);
  }

  /**
   * Client-side Decryption of aggregated sum: Plaintext = (C_sum - Sum(Masks)) mod P
   * @param {string} aggregateCiphertextHex
   * @param {Array<{ recordId: string, fieldName: string }>} recordsMetadata
   * @returns {number} Decrypted plain sum
   */
  decryptSum(aggregateCiphertextHex, recordsMetadata) {
    const cSum = BigInt('0x' + aggregateCiphertextHex);
    let totalMask = 0n;

    for (const meta of recordsMetadata) {
      const mask = this._deriveMask(meta.recordId, meta.fieldName);
      totalMask = (totalMask + mask) % this.modulus;
    }

    let decrypted = (cSum - totalMask) % this.modulus;
    if (decrypted < 0n) {
      decrypted += this.modulus;
    }

    // Convert back from scaled integer to float
    return Number(decrypted) / 100;
  }
}
