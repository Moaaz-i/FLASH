/**
 * FLASH SIMD & Vector Math Optimization Utilities (FlashSIMD)
 * High-throughput unrolled vector kernel operations for embeddings and numerical processing.
 */
export class FlashSIMD {
  /**
   * Fast unrolled Cosine Similarity (4-way loop unrolling)
   * @param {Float32Array} a
   * @param {Float32Array} b
   * @returns {number}
   */
  static cosineSimilarity(a, b) {
    const len = a.length;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    let i = 0;
    const limit = len - 3;

    for (; i < limit; i += 4) {
      const a0 = a[i], b0 = b[i];
      const a1 = a[i + 1], b1 = b[i + 1];
      const a2 = a[i + 2], b2 = b[i + 2];
      const a3 = a[i + 3], b3 = b[i + 3];

      dot += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
      normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
      normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
    }

    for (; i < len; i++) {
      const vA = a[i];
      const vB = b[i];
      dot += vA * vB;
      normA += vA * vA;
      normB += vB * vB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Fast unrolled Euclidean L2 Distance
   * @param {Float32Array} a
   * @param {Float32Array} b
   * @returns {number}
   */
  static euclideanDistance(a, b) {
    const len = a.length;
    let sum = 0;
    let i = 0;
    const limit = len - 3;

    for (; i < limit; i += 4) {
      const d0 = a[i] - b[i];
      const d1 = a[i + 1] - b[i + 1];
      const d2 = a[i + 2] - b[i + 2];
      const d3 = a[i + 3] - b[i + 3];
      sum += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
    }

    for (; i < len; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }

    return Math.sqrt(sum);
  }
}
