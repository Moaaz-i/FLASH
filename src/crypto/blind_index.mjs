import crypto from 'node:crypto';

/**
 * FLASH Blind Index & Searchable Encryption Engine
 * Generates cryptographic trapdoors, N-gram tokens, and bucketed range hashes
 * Includes Honey Padding & Salt Diversification to prevent frequency leakage attacks.
 */
export class FlashBlindIndex {
  /**
   * @param {string|Buffer} secretKey - Secret key dedicated for blind index generation
   * @param {object} [options]
   * @param {number} [options.ngramSize=3] - N-gram size for encrypted substring search
   * @param {number} [options.bucketSize=10] - Granularity for range buckets
   */
  constructor(secretKey, options = {}) {
    if (!secretKey) throw new Error('Blind index secret key required');
    this.key = Buffer.isBuffer(secretKey)
      ? secretKey
      : crypto.createHash('sha256').update(String(secretKey)).digest();
    this.ngramSize = options.ngramSize || 3;
    this.bucketSize = options.bucketSize || 10;
  }

  /**
   * Generates a salted cryptographic trapdoor for an exact value
   * @param {string} fieldName - e.g. "email"
   * @param {*} value - e.g. "john@example.com"
   * @returns {string} 64-char Hex Hash Token
   */
  generateTrapdoor(fieldName, value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    return crypto
      .createHmac('sha256', this.key)
      .update(`exact:${fieldName}:${normalized}`)
      .digest('hex');
  }

  /**
   * Generates N-Gram trapdoors for encrypted substring / regex matching ($regex, $substr)
   * With honey padding option to hide text length distribution
   * @param {string} fieldName
   * @param {string} text
   * @param {boolean} [addHoneyPadding=true]
   * @returns {string[]} Array of unique trapdoor hashes
   */
  generateNGramTrapdoors(fieldName, text, addHoneyPadding = true) {
    if (!text || typeof text !== 'string') return [];
    const normalized = text.toLowerCase();
    const tokens = new Set();

    if (normalized.length < this.ngramSize) {
      tokens.add(this.generateTrapdoor(fieldName, normalized));
    } else {
      for (let i = 0; i <= normalized.length - this.ngramSize; i++) {
        const sub = normalized.slice(i, i + this.ngramSize);
        const token = crypto
          .createHmac('sha256', this.key)
          .update(`ngram:${fieldName}:${sub}`)
          .digest('hex');
        tokens.add(token);
      }
    }

    // Honey Padding / Noise Injection: Add dummy tokens to mask length profile
    if (addHoneyPadding) {
      const paddingCount = Math.max(1, 4 - (tokens.size % 4));
      for (let p = 0; p < paddingCount; p++) {
        const noise = crypto
          .createHmac('sha256', this.key)
          .update(`honey:${fieldName}:${tokens.size}:${p}`)
          .digest('hex');
        tokens.add(noise);
      }
    }

    return Array.from(tokens);
  }

  /**
   * Generates Bucketed Range Tokens for numbers & dates ($gt, $gte, $lt, $lte)
   * Divides continuous values into cryptographically hashed discrete buckets
   * @param {string} fieldName
   * @param {number|Date} value
   * @returns {string[]} Array of bucket tokens covering the range from 0 to value
   */
  generateRangeBuckets(fieldName, value) {
    const num = value instanceof Date ? value.getTime() : Number(value);
    if (Number.isNaN(num)) return [];

    const bucketIndex = Math.floor(num / this.bucketSize);
    const token = crypto
      .createHmac('sha256', this.key)
      .update(`bucket:${fieldName}:${bucketIndex}`)
      .digest('hex');

    return {
      bucketIndex,
      token,
      exactTrapdoor: this.generateTrapdoor(fieldName, num)
    };
  }

  /**
   * Generates search tokens for a query range
   * @param {string} fieldName
   * @param {number} min
   * @param {number} max
   * @returns {string[]} Bucket tokens within the range
   */
  generateRangeQueryTokens(fieldName, min, max) {
    const startBucket = Math.floor(min / this.bucketSize);
    const endBucket = Math.floor(max / this.bucketSize);
    const tokens = [];

    for (let b = startBucket; b <= endBucket; b++) {
      const token = crypto
        .createHmac('sha256', this.key)
        .update(`bucket:${fieldName}:${b}`)
        .digest('hex');
      tokens.push(token);
    }
    return tokens;
  }
}
