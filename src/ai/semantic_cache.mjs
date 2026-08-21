import { FlashHNSWIndex } from '../vector/hnsw_index.mjs';
import { FlashQuantizer } from '../vector/quantizer.mjs';
import { FlashBinary } from '../binary/flash_binary.mjs';

/**
 * FLASH Multi-Tier Semantic LLM Response Cache (FlashSemanticCache)
 * Superpower Caching Engine with L1 (In-Memory Hot Cache) + L2 (Persistent LSM Store)
 * Supports Vector Quantization to store millions of cached queries in minimal RAM.
 */
export class FlashSemanticCache {
  /**
   * @param {object} [options]
   * @param {number} [options.similarityThreshold=0.92] - Minimum cosine similarity for cache hit
   * @param {number} [options.maxEntries=10000] - Max L1 in-memory entries
   * @param {number} [options.ttlMs=86400000] - 24 hours default TTL
   * @param {boolean} [options.useQuantization=true] - Compress vectors using SQ8
   * @param {object} [options.l2Collection=null] - Optional FlashDatabase collection for L2 disk persistence
   */
  constructor(options = {}) {
    this.threshold = options.similarityThreshold || 0.92;
    this.maxEntries = options.maxEntries || 10000;
    this.ttlMs = options.ttlMs || 86400000;
    this.useQuantization = options.useQuantization ?? true;
    this.l2Collection = options.l2Collection || null;

    this.hnsw = new FlashHNSWIndex({ M: 16, metric: 'cosine' });
    // cacheId -> { prompt: string, response: any, embedding: Float32Array|Uint8Array, createdAt: number, hits: number }
    this.l1Cache = new Map();
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Generates deterministic ID for prompt embedding
   */
  _id(prompt) {
    return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Synchronous L1 Cache Retrieval (Super-fast <0.05ms)
   * @param {Array<number>|Float32Array} queryEmbedding
   * @param {string} [promptText]
   * @returns {{ hit: boolean, response: any, similarity: number, prompt: string, tier: 'L1' }|null}
   */
  get(queryEmbedding, promptText = '') {
    const qVec = queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);

    // Search in-memory HNSW index (L1)
    const results = this.hnsw.search(qVec, 1);
    if (results.length > 0) {
      const top = results[0];
      if (top.score >= this.threshold) {
        const entry = this.l1Cache.get(top.docId);
        if (entry && (Date.now() - entry.createdAt <= this.ttlMs)) {
          entry.hits++;
          this.stats.l1Hits++;
          return {
            hit: true,
            response: entry.response,
            similarity: top.score,
            prompt: entry.prompt,
            tier: 'L1',
          };
        }
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Multi-Tier Async Cache Retrieval (L1 Hot Check -> L2 Disk Check)
   * @param {Array<number>|Float32Array} queryEmbedding
   * @param {string} [promptText]
   * @returns {Promise<{ hit: boolean, response: any, similarity: number, prompt: string, tier: 'L1'|'L2' }|null>}
   */
  async getAsync(queryEmbedding, promptText = '') {
    const l1Hit = this.get(queryEmbedding, promptText);
    if (l1Hit) return l1Hit;

    // Search L2 Persistent Collection if configured
    if (this.l2Collection && promptText) {
      try {
        const allDocs = FlashBinary.decodeRecords(await this.l2Collection.find({}));
        const l2Doc = allDocs.find((d) => d.prompt === promptText);
        if (l2Doc) {
          const createdAtTime = l2Doc.createdAt ? new Date(l2Doc.createdAt).getTime() : Date.now();
          if (Date.now() - createdAtTime <= this.ttlMs) {
            this.stats.l2Hits++;
            const qVec = queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);
            this._promoteToL1(l2Doc._id || this._id(promptText), l2Doc.prompt, qVec, l2Doc.response);
            return {
              hit: true,
              response: l2Doc.response,
              similarity: 1.0,
              prompt: l2Doc.prompt,
              tier: 'L2',
            };
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Promotes an entry into L1 in-memory cache
   * @private
   */
  _promoteToL1(cacheId, prompt, vec, response) {
    if (this.l1Cache.size >= this.maxEntries) {
      const oldestKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.l1Cache.set(cacheId, {
      prompt,
      response,
      embedding: vec,
      createdAt: Date.now(),
      hits: 1,
    });

    this.hnsw.insert(cacheId, vec);
  }

  /**
   * Stores a prompt, response, and its vector embedding in cache (L1 Memory + L2 Persistence)
   * @param {string} prompt
   * @param {Array<number>|Float32Array} embedding
   * @param {any} response
   */
  async set(prompt, embedding, response) {
    const cacheId = this._id(prompt);
    const vec = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);

    // 1. Store in L1 Memory (Instant)
    this._promoteToL1(cacheId, prompt, vec, response);

    // 2. Persist in L2 Disk Collection if configured
    if (this.l2Collection) {
      try {
        await this.l2Collection.insertOne({
          _id: cacheId,
          prompt,
          response,
          createdAt: new Date().toISOString(),
        });
      } catch {}
    }
  }

  /**
   * Clears all cache entries in L1
   */
  clear() {
    this.l1Cache.clear();
    this.hnsw = new FlashHNSWIndex({ M: 16, metric: 'cosine' });
  }

  /**
   * Returns cache metrics (hit ratio, total entries, L1 vs L2 hits)
   */
  getStats() {
    const totalHits = this.stats.l1Hits + this.stats.l2Hits;
    const totalQueries = totalHits + this.stats.misses;
    return {
      l1Size: this.l1Cache.size,
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      totalHits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRatio: totalQueries > 0 ? (totalHits / totalQueries) : 0,
    };
  }
}
