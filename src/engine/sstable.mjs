import fs from 'node:fs';
import path from 'node:path';
import { FlashBloomFilter, FlashCompressor } from '../binary/compressor.mjs';

/**
 * FLASH SSTable (Sorted String Table) Segment
 * File layout:
 * [Data Block (Compressed)] | [Index Block] | [Bloom Filter Block] | [Footer: 16 bytes]
 */

const SSTABLE_MAGIC = 0x53535442; // "SSTB"

/**
 * Fsyncs a directory so previously completed renames/unlinks are durable.
 * Best-effort: some platforms (e.g. some network filesystems) do not
 * support directory fsync and we must not fail writes because of it.
 * @param {string} dir
 */
export async function fsyncDir(dir) {
  let handle = null;
  try {
    handle = await fs.promises.open(dir, 'r');
    await handle.sync();
  } catch {
    // Unsupported platform -> best effort only.
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
  }
}

export class FlashSSTable {
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.bloomFilter = null;
    this.indexMap = new Map(); // key -> { offset, length }
    this.isLoaded = false;
  }

  /**
   * Writes sorted entries to a new SSTable file
   * @param {string} filePath
   * @param {Array<{ key: string, value: Buffer }>} sortedEntries
   * @returns {Promise<FlashSSTable>}
   */
  static async write(filePath, sortedEntries) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const bloom = new FlashBloomFilter(Math.max(256, sortedEntries.length * 2));
    const indexEntries = [];
    const dataChunks = [];
    let currentDataOffset = 0;

    for (const entry of sortedEntries) {
      bloom.add(entry.key);
      const valBuf = Buffer.isBuffer(entry.value)
        ? entry.value
        : Buffer.from(typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value));

      const len = valBuf.length;
      indexEntries.push({ key: entry.key, offset: currentDataOffset, len });
      dataChunks.push(valBuf);
      currentDataOffset += len;
    }

    const uncompressedData = Buffer.concat(dataChunks);
    const compressedData = await FlashCompressor.compressBlock(uncompressedData);

    const indexBuf = Buffer.from(JSON.stringify(indexEntries), 'utf-8');
    const bloomBuf = bloom.toBuffer();

    // Layout: [Compressed Data (N)] | [Index Block (M)] | [Bloom Filter (K)] | [Footer (16)]
    // Footer: [DataSize (4) | IndexSize (4) | BloomSize (4) | Magic (4)]
    const footer = Buffer.allocUnsafe(16);
    footer.writeUInt32LE(compressedData.length, 0);
    footer.writeUInt32LE(indexBuf.length, 4);
    footer.writeUInt32LE(bloomBuf.length, 8);
    footer.writeUInt32LE(SSTABLE_MAGIC, 12);

    const sstableBuffer = Buffer.concat([compressedData, indexBuf, bloomBuf, footer]);

    // Atomic durable write: temp file -> fsync -> rename -> fsync parent directory.
    // Guarantees the table is fully on disk before it becomes visible under its
    // final name, so a crash mid-flush can never leave a torn file.
    const tmpPath = `${filePath}.tmp`;
    const tmpHandle = await fs.promises.open(tmpPath, 'w');
    try {
      await tmpHandle.writeFile(sstableBuffer);
      await tmpHandle.sync();
    } finally {
      await tmpHandle.close();
    }
    await fs.promises.rename(tmpPath, filePath);
    await fsyncDir(dir);

    const table = new FlashSSTable(filePath);
    table.bloomFilter = bloom;
    table._dataCache = compressedData;
    table._decompressedData = uncompressedData;
    for (const item of indexEntries) {
      table.indexMap.set(item.key, { offset: item.offset, len: item.len });
    }
    table.isLoaded = true;
    return table;
  }

  async load() {
    if (this.isLoaded) return;
    const fileBuf = await fs.promises.readFile(this.filePath);
    if (fileBuf.length < 16) throw new Error('Invalid SSTable file size');

    const footer = fileBuf.subarray(fileBuf.length - 16);
    const magic = footer.readUInt32LE(12);
    if (magic !== SSTABLE_MAGIC) throw new Error('Invalid SSTable magic header');

    const dataSize = footer.readUInt32LE(0);
    const indexSize = footer.readUInt32LE(4);
    const bloomSize = footer.readUInt32LE(8);

    const indexStart = dataSize;
    const bloomStart = indexStart + indexSize;

    const indexBuf = fileBuf.subarray(indexStart, indexStart + indexSize);
    const bloomBuf = fileBuf.subarray(bloomStart, bloomStart + bloomSize);

    this.bloomFilter = FlashBloomFilter.fromBuffer(bloomBuf);
    const indexEntries = JSON.parse(indexBuf.toString('utf-8'));
    for (const item of indexEntries) {
      this.indexMap.set(item.key, { offset: item.offset, len: item.len });
    }

    this._dataCache = fileBuf.subarray(0, dataSize);
    this.isLoaded = true;
  }

  async get(key) {
    if (!this.isLoaded) await this.load();
    if (!this.bloomFilter.has(key)) return null;

    const meta = this.indexMap.get(key);
    if (!meta) return null;

    if (!this._decompressedData) {
      this._decompressedData = await FlashCompressor.decompressBlock(this._dataCache);
    }

    return this._decompressedData.subarray(meta.offset, meta.offset + meta.len);
  }
}
