/**
 * FLASH BM25 Full-Text & Hybrid Neural Search Plugin (FlashTextSearchPlugin)
 * Inverted index, Porter-style tokenization, BM25 TF-IDF relevance scoring, and RRF Hybrid Fusion
 */
export class FlashTextSearchPlugin {
  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    // term -> Map<docId, termFrequency>
    this.invertedIndex = new Map();
    // docId -> docLength
    this.docLengths = new Map();
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }

  /**
   * Tokenizes and normalizes text
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  /**
   * Indexes a document's text fields
   */
  indexDocument(docId, text) {
    const tokens = this.tokenize(text);
    const docLen = tokens.length;
    this.docLengths.set(docId, docLen);
    this.totalDocs++;

    const tfMap = new Map();
    for (const token of tokens) {
      tfMap.set(token, (tfMap.get(token) || 0) + 1);
    }

    for (const [term, freq] of tfMap.entries()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term).set(docId, freq);
    }

    // Update average document length
    let sum = 0;
    for (const len of this.docLengths.values()) sum += len;
    this.avgDocLength = sum / this.totalDocs;
  }

  /**
   * Computes BM25 score for a query against all indexed documents
   * @param {string} query
   * @returns {Array<{ docId: string, score: number }>}
   */
  search(query, topK = 20) {
    const queryTokens = this.tokenize(query);
    const scores = new Map();

    for (const term of queryTokens) {
      const postingList = this.invertedIndex.get(term);
      if (!postingList) continue;

      const df = postingList.size;
      // Inverse Document Frequency (IDF)
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));

      for (const [docId, tf] of postingList.entries()) {
        const docLen = this.docLengths.get(docId) || this.avgDocLength;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        const termScore = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + termScore);
      }
    }

    const results = [];
    for (const [docId, score] of scores.entries()) {
      results.push({ docId, score: Number(score.toFixed(4)) });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Reciprocal Rank Fusion (RRF) combining BM25 keyword rankings and Vector embeddings
   * @param {Array<{ docId: string }>} bm25Results
   * @param {Array<{ docId: string }>} vectorResults
   * @param {number} [k=60] - RRF smoothing parameter
   */
  static reciprocalRankFusion(bm25Results = [], vectorResults = [], k = 60) {
    const rrfScores = new Map();

    bm25Results.forEach((res, rank) => {
      const score = 1 / (k + rank + 1);
      rrfScores.set(res.docId, (rrfScores.get(res.docId) || 0) + score);
    });

    vectorResults.forEach((res, rank) => {
      const score = 1 / (k + rank + 1);
      rrfScores.set(res.docId, (rrfScores.get(res.docId) || 0) + score);
    });

    const combined = [];
    for (const [docId, score] of rrfScores.entries()) {
      combined.push({ docId, rrfScore: Number(score.toFixed(5)) });
    }

    combined.sort((a, b) => b.rrfScore - a.rrfScore);
    return combined;
  }
}
