import { FlashHNSWIndex } from './hnsw_index.mjs';
import { FlashQuantizer } from './quantizer.mjs';

export class FlashVectorIndex {
  /**
   * @param {object} [options]
   * @param {'exact'|'hnsw'} [options.engine='exact']
   * @param {'none'|'sq8'|'binary1bit'} [options.quantization='none']
   * @param {object} [options.hnswOptions]
   */
  constructor(options = {}) {
    this.engine = options.engine || 'exact';
    this.quantization = options.quantization || 'none';
    this.hnsw = new FlashHNSWIndex(options.hnswOptions || {});
    // docId -> Float32Array | QuantizedObject
    this.vectors = new Map();
  }

  /**
   * Adds or updates a document vector embedding
   * @param {string} docId
   * @param {Array<number>|Float32Array} vector
   */
  set(docId, vector) {
    if (!vector || (!Array.isArray(vector) && !(vector instanceof Float32Array))) return;
    const fVec = vector instanceof Float32Array ? vector : new Float32Array(vector);

    if (this.quantization === 'sq8') {
      this.vectors.set(String(docId), FlashQuantizer.quantizeSQ8(fVec));
    } else if (this.quantization === 'binary1bit') {
      this.vectors.set(String(docId), FlashQuantizer.quantizeBinary(fVec));
    } else {
      this.vectors.set(String(docId), fVec);
    }

    this.hnsw.insert(String(docId), fVec);
  }

  /**
   * Removes a document vector
   * @param {string} docId
   */
  delete(docId) {
    this.vectors.delete(String(docId));
  }

  /**
   * Computes Cosine Similarity between two normalized Float32Arrays in SIMD-like loop
   * @param {Float32Array} a
   * @param {Float32Array} b
   * @returns {number} Value between -1.0 and +1.0 (1.0 = identical)
   */
  static cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = a.length;

    for (let i = 0; i < len; i++) {
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
   * Performs Top-K nearest neighbors search
   * @param {Array<number>|Float32Array} queryVector
   * @param {number} [topK=10]
   * @param {Set<string>} [candidateFilter=null] - Optional docId candidate set from metadata filters
   * @param {object} [searchOptions]
   * @returns {Array<{ docId: string, score: number }>}
   */
  search(queryVector, topK = 10, candidateFilter = null, searchOptions = {}) {
    if (this.engine === 'hnsw' || searchOptions.useHnsw) {
      return this.hnsw.search(queryVector, topK, { filter: candidateFilter, ...searchOptions });
    }

    const q = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
    const scored = [];

    for (const [docId, entry] of this.vectors.entries()) {
      if (candidateFilter && !candidateFilter.has(docId)) {
        continue;
      }

      let score = 0;
      if (this.quantization === 'sq8') {
        score = FlashQuantizer.asymmetricCosineSQ8(q, entry.data, entry.min, entry.scale);
      } else if (this.quantization === 'binary1bit') {
        score = FlashQuantizer.cosineApproxFromBinary(FlashQuantizer.quantizeBinary(q).data, entry.data, entry.dimensions);
      } else {
        score = FlashVectorIndex.cosineSimilarity(q, entry);
      }

      scored.push({ docId, score });
    }

    // Sort descending by similarity score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Returns memory savings analytics for the current index
   */
  getMemoryStats(dimensions = 1536) {
    return FlashQuantizer.estimateMemorySavings(this.vectors.size, dimensions);
  }
}

export { FlashHNSWIndex, FlashQuantizer };
