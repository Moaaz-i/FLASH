/**
 * FLASH Vector Quantization Engine (FlashQuantizer)
 * Superpower Vector Compression for Massive AI Memory Scale (32x Compression).
 * 
 * 1. Scalar Quantization (SQ8): Compresses Float32 (4 bytes) to Int8/Uint8 (1 byte) -> 75% RAM savings with 99% accuracy.
 * 2. 1-Bit Binary Quantization: Compresses Float32 to 1-bit packed Uint32Array -> 32x RAM savings with ultra-fast bitwise XOR/Popcount.
 * 3. Asymmetric & Direct Quantized Distance Calculations without full dequantization.
 */

export class FlashQuantizer {
  /**
   * Fast popcount function for 32-bit integers
   * @param {number} n
   * @returns {number}
   */
  static popcount32(n) {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  /**
   * Scalar Quantization (SQ8)
   * Maps continuous Float32 values into discrete 8-bit integers (0 to 255)
   * @param {Float32Array|Array<number>} vector
   * @returns {{ data: Uint8Array, min: number, max: number, scale: number, dimensions: number }}
   */
  static quantizeSQ8(vector) {
    const len = vector.length;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < len; i++) {
      const val = vector[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }

    const range = max - min || 1e-6;
    const scale = 255.0 / range;
    const data = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      const q = Math.round((vector[i] - min) * scale);
      data[i] = q < 0 ? 0 : q > 255 ? 255 : q;
    }

    return {
      data,
      min,
      max,
      scale,
      dimensions: len,
      format: 'sq8',
    };
  }

  /**
   * Dequantizes SQ8 Uint8Array back to Float32Array
   * @param {Uint8Array} quantizedData
   * @param {number} min
   * @param {number} scale
   * @returns {Float32Array}
   */
  static dequantizeSQ8(quantizedData, min, scale) {
    const len = quantizedData.length;
    const invScale = 1.0 / (scale || 1.0);
    const vec = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      vec[i] = min + quantizedData[i] * invScale;
    }
    return vec;
  }

  /**
   * Fast Asymmetric Cosine Similarity between a Float32 query vector and an SQ8 quantized target
   * Avoids allocating new Float32Array, achieving maximum throughput.
   * @param {Float32Array|Array<number>} queryVec
   * @param {Uint8Array} targetSQ8Data
   * @param {number} min
   * @param {number} scale
   * @returns {number}
   */
  static asymmetricCosineSQ8(queryVec, targetSQ8Data, min, scale) {
    const len = queryVec.length;
    if (len !== targetSQ8Data.length) return 0;

    const invScale = 1.0 / (scale || 1.0);
    let dot = 0;
    let normQ = 0;
    let normT = 0;

    for (let i = 0; i < len; i++) {
      const q = queryVec[i];
      const t = min + targetSQ8Data[i] * invScale;
      dot += q * t;
      normQ += q * q;
      normT += t * t;
    }

    if (normQ === 0 || normT === 0) return 0;
    return dot / (Math.sqrt(normQ) * Math.sqrt(normT));
  }

  /**
   * 1-Bit Binary Quantization (Sign-bit Embedding)
   * Packs signs of vector coordinates into 32-bit integer bitmasks.
   * 1536 dimensions -> only 48 unsigned 32-bit integers (192 bytes instead of 6144 bytes!)
   * @param {Float32Array|Array<number>} vector
   * @returns {{ data: Uint32Array, dimensions: number, format: 'binary1bit' }}
   */
  static quantizeBinary(vector) {
    const len = vector.length;
    const numWords = Math.ceil(len / 32);
    const data = new Uint32Array(numWords);

    for (let i = 0; i < len; i++) {
      if (vector[i] > 0) {
        const wordIndex = i >>> 5; // Math.floor(i / 32)
        const bitIndex = i & 31;   // i % 32
        data[wordIndex] |= (1 << bitIndex);
      }
    }

    return {
      data,
      dimensions: len,
      format: 'binary1bit',
    };
  }

  /**
   * Computes Hamming Distance between two 1-bit packed Binary vectors
   * @param {Uint32Array} binA
   * @param {Uint32Array} binB
   * @returns {number} Number of differing bits
   */
  static hammingDistance(binA, binB) {
    const len = Math.min(binA.length, binB.length);
    let dist = 0;
    for (let i = 0; i < len; i++) {
      const xor = binA[i] ^ binB[i];
      if (xor !== 0) {
        dist += this.popcount32(xor);
      }
    }
    return dist;
  }

  /**
   * Computes normalized Hamming Similarity (1.0 = identical, 0.0 = completely opposite)
   * @param {Uint32Array} binA
   * @param {Uint32Array} binB
   * @param {number} totalDimensions
   * @returns {number}
   */
  static hammingSimilarity(binA, binB, totalDimensions) {
    const dist = this.hammingDistance(binA, binB);
    const dims = totalDimensions || (binA.length * 32);
    return Math.max(0, 1.0 - (dist / dims));
  }

  /**
   * Approximates Cosine Similarity from Hamming Distance
   * Angular distance formula: cos(theta) = cos(pi * HammingDist / dimensions)
   * @param {Uint32Array} binA
   * @param {Uint32Array} binB
   * @param {number} totalDimensions
   * @returns {number}
   */
  static cosineApproxFromBinary(binA, binB, totalDimensions) {
    const dist = this.hammingDistance(binA, binB);
    const dims = totalDimensions || (binA.length * 32);
    return Math.cos(Math.PI * (dist / dims));
  }

  /**
   * Estimates memory usage comparison across formats
   * @param {number} count - Number of vectors
   * @param {number} dimensions - Number of dimensions
   */
  static estimateMemorySavings(count, dimensions) {
    const rawBytes = count * dimensions * 4; // Float32
    const sq8Bytes = count * (dimensions + 16); // Uint8 + min/scale metadata
    const binBytes = count * (Math.ceil(dimensions / 32) * 4 + 8); // Uint32 + dims

    return {
      vectorCount: count,
      dimensions,
      rawFloat32MB: (rawBytes / (1024 * 1024)).toFixed(2) + ' MB',
      sq8MB: (sq8Bytes / (1024 * 1024)).toFixed(2) + ' MB',
      binary1BitMB: (binBytes / (1024 * 1024)).toFixed(2) + ' MB',
      sq8Savings: `${(((rawBytes - sq8Bytes) / rawBytes) * 100).toFixed(1)}% (4x)`,
      binary1BitSavings: `${(((rawBytes - binBytes) / rawBytes) * 100).toFixed(1)}% (32x)`,
    };
  }
}
