/**
 * FLASH Full-Text Search Engine with BM25 Ranking (FlashSearchEngine)
 * Inverted Index, tokenization, and BM25 relevance score computation.
 */
export class FlashSearchEngine {
  /**
   * @param {object} [options]
   * @param {number} [options.k1=1.5] - BM25 term frequency saturation
   * @param {number} [options.b=0.75] - BM25 document length normalization
   */
  constructor(options = {}) {
    this.k1 = options.k1 || 1.5;
    this.b = options.b || 0.75;
    // term -> Map<docId, termFrequency>
    this.invertedIndex = new Map();
    // docId -> docLength (number of tokens)
    this.docLengths = new Map();
    this.totalTokens = 0;
  }

  _tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    const STOP_WORDS = new Set([
      'من', 'عن', 'في', 'إلى', 'الى', 'على', 'مع', 'هو', 'هي', 'ما', 'هل', 'أن', 'ان', 'إن', 'او', 'أو', 'لا', 'لم', 'لن', 'قد', 'ثم', 'حتى', 'معلومات', 'the', 'a', 'an', 'is', 'are', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'with', 'about'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0 && !STOP_WORDS.has(t));
  }



  /**
   * Indexes a document for full-text search
   * @param {string} docId
   * @param {string} text
   */
  indexDocument(docId, text) {
    const tokens = this._tokenize(text);
    this.docLengths.set(docId, tokens.length);
    this.totalTokens += tokens.length;

    const tfMap = new Map();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    for (const [term, freq] of tfMap.entries()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term).set(docId, freq);
    }
  }

  /**
   * Searches documents by text query with BM25 score
   * @param {string} query
   * @param {number} [limit=10]
   * @returns {Array<{ docId: string, score: number }>}
   */
  search(query, limit = 10) {
    const queryTokens = this._tokenize(query);
    if (queryTokens.length === 0 || this.docLengths.size === 0) return [];

    const N = this.docLengths.size;
    const avgdl = this.totalTokens / N;
    const scores = new Map(); // docId -> score

    for (const term of queryTokens) {
      const posting = this.invertedIndex.get(term);
      if (!posting) continue;

      const n_qi = posting.size;
      const idf = Math.log((N - n_qi + 0.5) / (n_qi + 0.5) + 1);

      for (const [docId, f_qi] of posting.entries()) {
        const docLen = this.docLengths.get(docId) || avgdl;
        const numerator = f_qi * (this.k1 + 1);
        const denominator = f_qi + this.k1 * (1 - this.b + this.b * (docLen / avgdl));
        const termScore = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + termScore);
      }
    }

    return Array.from(scores.entries())
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
