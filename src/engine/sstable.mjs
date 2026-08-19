import fs from "node:fs";
import path from "node:path";
import { FlashBloomFilter, FlashCompressor } from "../binary/compressor.mjs";

/**
 * FLASH SSTable (Sorted String Table) Segment
 * v1 layout: [Compressed Data Block] | [JSON Index] | [Bloom] | [Footer 16B magic SSTB]
 * v2 layout: [Compressed Blocks...] | [Binary Index] | [Block Meta] | [Bloom] | [Footer 24B magic SST2]
 */

const SSTABLE_MAGIC_V1 = 0x53535442; // "SSTB"
const SSTABLE_MAGIC_V2 = 0x53535432; // "SST2"
const BLOCK_UNCOMPRESSED_LIMIT = 32 * 1024;

export async function fsyncDir(dir) {
  let handle = null;
  try {
    handle = await fs.promises.open(dir, "r");
    await handle.sync();
  } catch {
    // best effort
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
  }
}

function encodeBinaryIndex(indexEntries) {
  let size = 4;
  const keyBufs = indexEntries.map((e) => Buffer.from(e.key, "utf-8"));
  for (const kb of keyBufs) size += 2 + kb.length + 2 + 4 + 4;

  const buf = Buffer.allocUnsafe(size);
  buf.writeUInt32LE(indexEntries.length, 0);
  let off = 4;
  for (let i = 0; i < indexEntries.length; i++) {
    const entry = indexEntries[i];
    const kb = keyBufs[i];
    buf.writeUInt16LE(kb.length, off);
    kb.copy(buf, off + 2);
    off += 2 + kb.length;
    buf.writeUInt16LE(entry.blockId, off);
    buf.writeUInt32LE(entry.offset, off + 2);
    buf.writeUInt32LE(entry.len, off + 6);
    off += 10;
  }
  return buf;
}

function decodeBinaryIndex(buf) {
  const count = buf.readUInt32LE(0);
  const entries = [];
  let off = 4;
  for (let i = 0; i < count; i++) {
    const keyLen = buf.readUInt16LE(off);
    const key = buf.toString("utf-8", off + 2, off + 2 + keyLen);
    off += 2 + keyLen;
    const blockId = buf.readUInt16LE(off);
    const offset = buf.readUInt32LE(off + 2);
    const len = buf.readUInt32LE(off + 6);
    off += 10;
    entries.push({ key, blockId, offset, len });
  }
  return entries;
}

function encodeBlockMeta(blocks) {
  const buf = Buffer.allocUnsafe(4 + blocks.length * 12);
  buf.writeUInt32LE(blocks.length, 0);
  let off = 4;
  for (const b of blocks) {
    buf.writeUInt32LE(b.compOffset, off);
    buf.writeUInt32LE(b.compLen, off + 4);
    buf.writeUInt32LE(b.uncompLen, off + 8);
    off += 12;
  }
  return buf;
}

function decodeBlockMeta(buf) {
  const count = buf.readUInt32LE(0);
  const blocks = [];
  let off = 4;
  for (let i = 0; i < count; i++) {
    blocks.push({
      compOffset: buf.readUInt32LE(off),
      compLen: buf.readUInt32LE(off + 4),
      uncompLen: buf.readUInt32LE(off + 8),
    });
    off += 12;
  }
  return blocks;
}

export class FlashSSTable {
  constructor(filePath, level = 0) {
    this.filePath = filePath;
    this.level = level;
    this.bloomFilter = null;
    this.indexMap = new Map();
    this.isLoaded = false;
    this.formatVersion = 1;
    this._fileHandle = null;
    this._dataOffset = 0;
    this._dataSize = 0;
    this._blocks = [];
    this._blockCache = new Map();
    this._decompressedData = null;
  }

  static async write(filePath, sortedEntries, options = {}) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const bloom = new FlashBloomFilter(Math.max(256, sortedEntries.length * 2));
    const valueBufs = sortedEntries.map((entry) =>
      Buffer.isBuffer(entry.value)
        ? entry.value
        : Buffer.from(
            typeof entry.value === "string"
              ? entry.value
              : JSON.stringify(entry.value),
          ),
    );

    for (const entry of sortedEntries) {
      bloom.add(entry.key);
    }

    const v2Blocks = [];
    const v2Meta = [];
    const remappedIndex = [];
    let compOffset = 0;
    let blockId = 0;
    let blockChunks = [];
    let blockSize = 0;

    const flushBlock = async () => {
      if (blockChunks.length === 0) return;
      const blockData = Buffer.concat(blockChunks);
      const compressed = await FlashCompressor.compressBlock(blockData);
      v2Meta.push({
        compOffset,
        compLen: compressed.length,
        uncompLen: blockData.length,
      });
      v2Blocks.push(compressed);
      compOffset += compressed.length;
      blockChunks = [];
      blockSize = 0;
      blockId++;
    };

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      const valBuf = valueBufs[i];
      const valLen = valBuf.length;

      if (
        blockSize > 0 &&
        blockSize + valLen > BLOCK_UNCOMPRESSED_LIMIT
      ) {
        await flushBlock();
      }

      remappedIndex.push({
        key: entry.key,
        blockId,
        offset: blockSize,
        len: valLen,
      });
      blockChunks.push(valBuf);
      blockSize += valLen;
    }

    await flushBlock();

    const compressedData = Buffer.concat(v2Blocks);
    const indexBuf = encodeBinaryIndex(remappedIndex);
    const blockMetaBuf = encodeBlockMeta(v2Meta);
    const bloomBuf = bloom.toBuffer();

    const footer = Buffer.allocUnsafe(24);
    footer.writeUInt32LE(compressedData.length, 0);
    footer.writeUInt32LE(indexBuf.length, 4);
    footer.writeUInt32LE(bloomBuf.length, 8);
    footer.writeUInt32LE(blockMetaBuf.length, 12);
    footer.writeUInt32LE(options.level || 0, 16);
    footer.writeUInt32LE(SSTABLE_MAGIC_V2, 20);

    const sstableBuffer = Buffer.concat([
      compressedData,
      indexBuf,
      blockMetaBuf,
      bloomBuf,
      footer,
    ]);

    const tmpPath = `${filePath}.tmp`;
    const tmpHandle = await fs.promises.open(tmpPath, "w");
    try {
      await tmpHandle.writeFile(sstableBuffer);
      await tmpHandle.sync();
    } finally {
      await tmpHandle.close();
    }
    await fs.promises.rename(tmpPath, filePath);
    await fsyncDir(dir);

    const table = new FlashSSTable(filePath, options.level || 0);
    table.bloomFilter = bloom;
    table.formatVersion = 2;
    table._blocks = v2Meta;
    table._dataSize = compressedData.length;
    for (const item of remappedIndex) {
      table.indexMap.set(item.key, {
        blockId: item.blockId,
        offset: item.offset,
        len: item.len,
      });
    }
    table.isLoaded = true;
    return table;
  }

  async _ensureHandle() {
    if (!this._fileHandle) {
      this._fileHandle = await fs.promises.open(this.filePath, "r");
    }
  }

  async _readBlock(blockId) {
    if (this._blockCache.has(blockId)) {
      return this._blockCache.get(blockId);
    }

    await this._ensureHandle();
    const meta = this._blocks[blockId];
    if (!meta) return null;

    const buf = Buffer.allocUnsafe(meta.compLen);
    await this._fileHandle.read(
      buf,
      0,
      meta.compLen,
      this._dataOffset + meta.compOffset,
    );
    const decompressed = await FlashCompressor.decompressBlock(buf);
    if (this._blockCache.size > 32) {
      const firstKey = this._blockCache.keys().next().value;
      this._blockCache.delete(firstKey);
    }
    this._blockCache.set(blockId, decompressed);
    return decompressed;
  }

  async load() {
    if (this.isLoaded) return;

    const stat = await fs.promises.stat(this.filePath);
    if (stat.size < 16) throw new Error("Invalid SSTable file size");

    const footerSize = stat.size >= 24 ? 24 : 16;
    const footerHandle = await fs.promises.open(this.filePath, "r");
    const footer = Buffer.allocUnsafe(footerSize);
    await footerHandle.read(footer, 0, footerSize, stat.size - footerSize);
    await footerHandle.close();

    const magic = footer.readUInt32LE(footerSize - 4);
    if (magic === SSTABLE_MAGIC_V2) {
      this.formatVersion = 2;
      this._dataSize = footer.readUInt32LE(0);
      const indexSize = footer.readUInt32LE(4);
      const bloomSize = footer.readUInt32LE(8);
      const blockMetaSize = footer.readUInt32LE(12);
      this.level = footer.readUInt32LE(16);

      const metaStart = this._dataSize + indexSize;
      const bloomStart = metaStart + blockMetaSize;

      const handle = await fs.promises.open(this.filePath, "r");
      const indexBuf = Buffer.allocUnsafe(indexSize);
      const blockMetaBuf = Buffer.allocUnsafe(blockMetaSize);
      const bloomBuf = Buffer.allocUnsafe(bloomSize);
      await handle.read(indexBuf, 0, indexSize, this._dataSize);
      await handle.read(blockMetaBuf, 0, blockMetaSize, metaStart);
      await handle.read(bloomBuf, 0, bloomSize, bloomStart);
      await handle.close();

      this.bloomFilter = FlashBloomFilter.fromBuffer(bloomBuf);
      this._blocks = decodeBlockMeta(blockMetaBuf);
      for (const item of decodeBinaryIndex(indexBuf)) {
        this.indexMap.set(item.key, {
          blockId: item.blockId,
          offset: item.offset,
          len: item.len,
        });
      }
    } else if (magic === SSTABLE_MAGIC_V1) {
      this.formatVersion = 1;
      this._dataSize = footer.readUInt32LE(0);
      const indexSize = footer.readUInt32LE(4);
      const bloomSize = footer.readUInt32LE(8);

      const handle = await fs.promises.open(this.filePath, "r");
      const indexBuf = Buffer.allocUnsafe(indexSize);
      const bloomBuf = Buffer.allocUnsafe(bloomSize);
      await handle.read(indexBuf, 0, indexSize, this._dataSize);
      await handle.read(bloomBuf, 0, bloomSize, this._dataSize + indexSize);
      await handle.close();

      this.bloomFilter = FlashBloomFilter.fromBuffer(bloomBuf);
      for (const item of JSON.parse(indexBuf.toString("utf-8"))) {
        this.indexMap.set(item.key, {
          blockId: 0,
          offset: item.offset,
          len: item.len,
        });
      }
      this._blocks = [{ compOffset: 0, compLen: this._dataSize, uncompLen: 0 }];
    } else {
      throw new Error("Invalid SSTable magic header");
    }

    this.isLoaded = true;
  }

  async get(key) {
    if (!this.isLoaded) await this.load();
    if (!this.bloomFilter.has(key)) return null;

    const meta = this.indexMap.get(key);
    if (!meta) return null;

    if (this.formatVersion === 1) {
      if (!this._decompressedData) {
        await this._ensureHandle();
        const compBuf = Buffer.allocUnsafe(this._dataSize);
        await this._fileHandle.read(
          compBuf,
          0,
          this._dataSize,
          this._dataOffset,
        );
        this._decompressedData = await FlashCompressor.decompressBlock(compBuf);
      }
      return this._decompressedData.subarray(
        meta.offset,
        meta.offset + meta.len,
      );
    }

    const block = await this._readBlock(meta.blockId);
    if (!block) return null;
    return block.subarray(meta.offset, meta.offset + meta.len);
  }

  async close() {
    if (this._fileHandle) {
      await this._fileHandle.close();
      this._fileHandle = null;
    }
  }
}
