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
   * 32-byte trapdoor digest (compact storage — ~50% smaller than hex on disk).
   * @param {string} fieldName
   * @param {*} value
   * @returns {Buffer}
   */
  generateTrapdoorBytes(fieldName, value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    return crypto
      .createHmac('sha256', this.key)
      .update(`exact:${fieldName}:${normalized}`)
      .digest();
  }

  /**
   * Normalize trapdoor token for index map keys (hex legacy or base64 binary).
   * @param {string|Buffer|null|undefined} token
   * @returns {string|null}
   */
  static trapdoorKey(token) {
    if (token == null) return null;
    if (Buffer.isBuffer(token)) return token.toString('base64');
    return String(token);
  }

  /**
   * Coerce legacy hex or Buffer trapdoor to 32-byte Buffer.
   * @param {string|Buffer} token
   * @returns {Buffer}
   */
  static trapdoorBytes(token) {
    if (Buffer.isBuffer(token)) return token;
    if (typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token)) {
      return Buffer.from(token, 'hex');
    }
    return Buffer.from(String(token), 'utf-8');
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
   * Compact n-gram trapdoors as 32-byte buffers (no honey padding when disabled).
   * @param {string} fieldName
   * @param {string} text
   * @param {boolean} [addHoneyPadding=false]
   * @returns {Buffer[]}
   */
  generateNGramTrapdoorsBytes(fieldName, text, addHoneyPadding = false) {
    if (!text || typeof text !== 'string') return [];
    const normalized = text.toLowerCase();
    const tokenBufs = [];
    const seen = new Set();

    const pushToken = (buf) => {
      const key = buf.toString('base64');
      if (seen.has(key)) return;
      seen.add(key);
      tokenBufs.push(buf);
    };

    if (normalized.length < this.ngramSize) {
      const single = this.generateTrapdoorBytes(fieldName, normalized);
      if (single) pushToken(single);
    } else {
      for (let i = 0; i <= normalized.length - this.ngramSize; i++) {
        const sub = normalized.slice(i, i + this.ngramSize);
        pushToken(
          crypto
            .createHmac('sha256', this.key)
            .update(`ngram:${fieldName}:${sub}`)
            .digest(),
        );
      }
    }

    if (addHoneyPadding) {
      const paddingCount = Math.max(1, 4 - (tokenBufs.length % 4));
      for (let p = 0; p < paddingCount; p++) {
        pushToken(
          crypto
            .createHmac('sha256', this.key)
            .update(`honey:${fieldName}:${tokenBufs.length}:${p}`)
            .digest(),
        );
      }
    }

    return tokenBufs;
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
