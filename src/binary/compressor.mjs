import zlib from 'node:zlib';

/**
 * FLASH Compact Index & Block Compression Engine
 * Efficient storage footprint reduction via snappy/deflate block compression
 * and Bloom Filters for instant negative lookups.
 */

export class FlashBloomFilter {
  /**
   * @param {number} [size=1024] - Size of bit array in bytes
   * @param {number} [hashCount=3] - Number of hash functions
   */
  constructor(size = 1024, hashCount = 3) {
    this.size = size;
    this.buffer = Buffer.alloc(size);
    this.hashCount = hashCount;
  }

  static fromBuffer(buffer, hashCount = 3) {
    const filter = new FlashBloomFilter(buffer.length, hashCount);
    filter.buffer = Buffer.from(buffer);
    return filter;
  }

  _hashes(str) {
    const s = String(str);
    const hashes = [];
    let h1 = 0x811c9dc5;
    let h2 = 0x5bd1e995;

    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code;
      h2 = Math.imul(h2, 0x5bd1e995);
    }

    const totalBits = this.size * 8;
    for (let k = 0; k < this.hashCount; k++) {
      const combined = (h1 + k * h2) >>> 0;
      hashes.push(combined % totalBits);
    }
    return hashes;
  }

  add(key) {
    const bitIndices = this._hashes(key);
    for (const bit of bitIndices) {
      const byteIdx = Math.floor(bit / 8);
      const bitOffset = bit % 8;
      this.buffer[byteIdx] |= 1 << bitOffset;
    }
  }

  has(key) {
    const bitIndices = this._hashes(key);
    for (const bit of bitIndices) {
      const byteIdx = Math.floor(bit / 8);
      const bitOffset = bit % 8;
      if ((this.buffer[byteIdx] & (1 << bitOffset)) === 0) {
        return false; // Definitely not in set
      }
    }
    return true; // Likely in set
  }

  toBuffer() {
    return this.buffer;
  }
}

export class FlashCompressor {
  /**
   * Fast deflate block compression (Optimized for database storage)
   * @param {Buffer} data
   * @returns {Promise<Buffer>}
   */
  static async compressBlock(data) {
    return new Promise((resolve, reject) => {
      zlib.deflateRaw(data, { level: 1 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * Fast inflate block decompression
   * @param {Buffer} compressedData
   * @returns {Promise<Buffer>}
   */
  static async decompressBlock(compressedData) {
    return new Promise((resolve, reject) => {
      zlib.inflateRaw(compressedData, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
}
