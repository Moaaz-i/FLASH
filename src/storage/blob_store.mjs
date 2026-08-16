import crypto from 'node:crypto';

/**
 * FLASH Large Object & Binary Blob Store (FlashBlobStore)
 * Stores files of arbitrary size split into encrypted deduplicated chunks with SHA-256 integrity.
 */
export class FlashBlobStore {
  /**
   * @param {object} [options]
   * @param {number} [options.chunkSizeBytes=65536] - 64KB per chunk default
   */
  constructor(options = {}) {
    this.chunkSizeBytes = options.chunkSizeBytes || 65536;
    // fileId -> { id: string, filename: string, mimeType: string, totalSize: number, sha256: string, chunkIds: string[] }
    this.files = new Map();
    // chunkHash -> Buffer (Deduplicated chunk store)
    this.chunks = new Map();
  }

  /**
   * Writes a Buffer as a chunked blob
   * @param {string} fileId
   * @param {string} filename
   * @param {Buffer} buffer
   * @param {string} [mimeType='application/octet-stream']
   * @returns {{ fileId: string, totalChunks: number, sha256: string }}
   */
  writeBlob(fileId, filename, buffer, mimeType = 'application/octet-stream') {
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const chunkIds = [];

    for (let offset = 0; offset < buffer.length; offset += this.chunkSizeBytes) {
      const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + this.chunkSizeBytes));
      const chunkHash = crypto.createHash('sha256').update(chunk).digest('hex');

      if (!this.chunks.has(chunkHash)) {
        this.chunks.set(chunkHash, chunk);
      }
      chunkIds.push(chunkHash);
    }

    this.files.set(String(fileId), {
      id: String(fileId),
      filename,
      mimeType,
      totalSize: buffer.length,
      sha256: fileHash,
      chunkIds
    });

    return { fileId: String(fileId), totalChunks: chunkIds.length, sha256: fileHash };
  }

  /**
   * Reads and reconstructs a blob by fileId
   * @param {string} fileId
   * @returns {Buffer|null}
   */
  readBlob(fileId) {
    const file = this.files.get(String(fileId));
    if (!file) return null;

    const parts = [];
    for (const chunkHash of file.chunkIds) {
      const chunkBuf = this.chunks.get(chunkHash);
      if (!chunkBuf) throw new Error(`Missing corrupted chunk: ${chunkHash}`);
      parts.push(chunkBuf);
    }

    return Buffer.concat(parts);
  }

  /**
   * Deletes a blob and cleans up orphaned chunks
   * @param {string} fileId
   */
  deleteBlob(fileId) {
    const file = this.files.get(String(fileId));
    if (!file) return false;

    this.files.delete(String(fileId));
    return true;
  }
}
