import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { FlashMemTable } from '../engine/memtable.mjs';
import { FlashArc, ARC_OP, WAL_OP } from '../engine/arc.mjs';
import { FlashSSTable } from '../engine/sstable.mjs';
import { FlashIndexManager } from '../engine/index_manager.mjs';
import { FlashBinary } from '../binary/flash_binary.mjs';
import { FlashMerkle } from '../crypto/merkle.mjs';
import { logger } from './logger.mjs';

/**
 * FLASH Collection Engine (FlashCollection)
 * Orchestrates MemTable, FlashArc (.farc Vault), SSTables, Blind Indexing, and Merkle State Root
 * Implements a true LSM-Tree: MemTable (L0 in-memory) -> Immutable SSTables (L1 on-disk)
 */
export class FlashCollection {
  /**
   * @param {string} name - Collection name
   * @param {string} storageDir - Base directory for data files
   * @param {object} [options]
   * @param {number} [options.memtableThreshold=64 * 1024] - Flush to SSTable when MemTable reaches this size (Default 64KB)
   */
  constructor(name, storageDir, options = {}) {
    this.name = name;
    this.storageDir = path.join(storageDir, name);
    this.memtableThreshold = options.memtableThreshold || 64 * 1024; // 64KB default
    this.memtable = new FlashMemTable();
    this.indexManager = new FlashIndexManager();
    this.arc = new FlashArc(path.join(this.storageDir, 'commit.farc'));
    this.wal = this.arc; // Backward compatibility alias
    this.sstables = []; // List of immutable FlashSSTable instances
    this.merkleTree = null;
    this.docOrder = []; // Array of docIds for Merkle tree leaves
    this.isMerkleDirty = false;
    this.isReady = false;
  }

  async init() {
    if (this.isReady) return;
    logger.info('FlashCollection', 'initializing', { collection: this.name });

    // 1. Load existing SSTables from disk
    await this._loadExistingSSTables();

    // 2. Open and replay FlashArc vault for fast crash recovery of un-flushed memory state
    let replayed = 0;
    await this.arc.open();
    await this.arc.recover((opCode, key, dataBuf) => {
      if (opCode === ARC_OP.INSERT || opCode === ARC_OP.UPDATE) {
        this.memtable.set(key, dataBuf);
        try {
          const doc = FlashBinary.deserialize(dataBuf);
          if (doc._blind) this.indexManager.indexDocument(key, doc._blind);
          if (!this.docOrder.includes(key)) this.docOrder.push(key);
          replayed++;
        } catch {
          // ignore corrupted recovery chunk
        }
      } else if (opCode === ARC_OP.DELETE) {
        this.memtable.delete(key);
        this.indexManager.removeDocument(key);
        const idx = this.docOrder.indexOf(key);
        if (idx !== -1) this.docOrder.splice(idx, 1);
      }
    });

    this.isMerkleDirty = true;
    this.isReady = true;
    logger.info('FlashCollection', 'ready', {
      collection: this.name,
      sstables: this.sstables.length,
      walReplayed: replayed,
    });
  }

  async _loadExistingSSTables() {
    if (!fs.existsSync(this.storageDir)) return;
    const allFiles = await fs.promises.readdir(this.storageDir);

    // Remove stale temp files from writes interrupted by a crash so they
    // never confuse compaction or future flushes.
    for (const f of allFiles) {
      if (f.endsWith('.sst.tmp') || f.endsWith('.tmp')) {
        try {
          await fs.promises.unlink(path.join(this.storageDir, f));
        } catch {}
      }
    }

    const sstFiles = allFiles
      .filter(f => f.endsWith('.sst') && !f.includes('.tmp'))
      .sort();

    for (const f of sstFiles) {
      const sstPath = path.join(this.storageDir, f);
      try {
        const sstable = new FlashSSTable(sstPath);
        await sstable.load();
        this.sstables.push(sstable);

        // Populate indexes and docOrder from SSTable metadata
        for (const [key] of sstable.indexMap.entries()) {
          if (!this.docOrder.includes(key)) {
            this.docOrder.push(key);
          }
        }
      } catch (err) {
        // Torn/corrupt SSTable left by a crash mid-flush: skip it so the
        // remaining tables and WAL can still recover data.
        logger.warn('FlashCollection', 'skipping corrupt SSTable', {
          collection: this.name,
          file: f,
          error: err.message,
        });
      }
    }
  }

  _rebuildMerkleTree() {
    const leafHashes = [];
    for (const id of this.docOrder) {
      const val = this.memtable.get(id);
      if (val && !val._tombstone) {
        const hash = crypto.createHash('sha256').update(val).digest('hex');
        leafHashes.push(hash);
      } else {
        // Check loaded SSTables
        for (const sst of this.sstables) {
          if (sst._dataCache && sst.indexMap.has(id)) {
            const meta = sst.indexMap.get(id);
            const rawChunk = sst._dataCache.subarray(meta.offset, meta.offset + meta.len);
            const hash = crypto.createHash('sha256').update(rawChunk).digest('hex');
            leafHashes.push(hash);
            break;
          }
        }
      }
    }
    this.merkleTree = new FlashMerkle(leafHashes);
  }

  /**
   * Insert a single document (Already encrypted by client SDK)
   * @param {object} doc - Document containing _id, _enc, _blind, etc.
   * @returns {Promise<{ insertedId: string, merkleRoot: string }>}
   */
  async insertOne(doc) {
    if (!this.isReady) await this.init();

    if (!doc._id) {
      doc._id = crypto.randomUUID();
    }

    const docId = String(doc._id);
    const binaryBuf = FlashBinary.serialize(doc);

    // 1. Write to WAL for Durability
    await this.wal.append(WAL_OP.INSERT, docId, binaryBuf);

    // 2. Insert into MemTable
    this.memtable.set(docId, binaryBuf, binaryBuf.length);

    // 3. Index Trapdoors
    if (doc._blind) {
      this.indexManager.indexDocument(docId, doc._blind);
    }

    // 4. Mark Merkle Tree as dirty
    if (!this.docOrder.includes(docId)) {
      this.docOrder.push(docId);
    }
    this.isMerkleDirty = true;

    // 5. Auto-Flush to SSTable if MemTable exceeds threshold
    if (this.memtable.byteSize >= this.memtableThreshold) {
      await this.flush();
    }

    return {
      insertedId: docId,
      merkleRoot: this.getMerkleRoot()
    };
  }

  /**
   * Flushes current MemTable into an immutable on-disk SSTable segment (Checkpointing)
   * Truncates the WAL to prevent unbounded log growth
   */
  async flush() {
    if (!this.isReady) await this.init();
    const entries = this.memtable.entries();
    if (entries.length === 0) return null;

    const t0 = Date.now();
    const timestamp = Date.now();
    const sstPath = path.join(this.storageDir, `sstable_${timestamp}_${this.sstables.length + 1}.sst`);

    const sstable = await FlashSSTable.write(sstPath, entries);
    this.sstables.unshift(sstable); // Insert at beginning (newest first)

    // Clear MemTable and reset WAL checkpoint
    this.memtable.clear();
    await this.wal.truncate();

    const durationMs = Date.now() - t0;
    logger.info('FlashCollection', 'flush completed', {
      collection: this.name,
      records: entries.length,
      sstables: this.sstables.length,
      durationMs,
    });

    return sstable;
  }

  /**
   * Reads raw document buffer from MemTable first, falling back to SSTables (LSM-Tree multi-tier lookup)
   * @param {string} docId
   * @returns {Promise<Buffer|null>}
   */
  async _getRawDoc(docId) {
    if (!this.isReady) await this.init();

    // 1. Check In-Memory MemTable (L0)
    const memVal = this.memtable.get(docId);
    if (memVal) {
      return memVal._tombstone ? null : memVal;
    }

    // 2. Check Immutable SSTables on disk (L1..LN) using Bloom Filter in microsecond time
    for (const sst of this.sstables) {
      const sstVal = await sst.get(docId);
      if (sstVal) {
        return sstVal;
      }
    }

    return null;
  }

  getMerkleRoot() {
    if (this.isMerkleDirty || !this.merkleTree) {
      this._rebuildMerkleTree();
      this.isMerkleDirty = false;
    }
    return this.merkleTree ? this.merkleTree.getRoot() : '';
  }

  getMerkleProof(docId) {
    if (this.isMerkleDirty || !this.merkleTree) {
      this._rebuildMerkleTree();
      this.isMerkleDirty = false;
    }
    const idx = this.docOrder.indexOf(String(docId));
    if (idx === -1 || !this.merkleTree) return null;
    return {
      index: idx,
      proof: this.merkleTree.getProof(idx),
      root: this.getMerkleRoot()
    };
  }

  verifyRecordIntegrity(docId) {
    const proof = this.getMerkleProof(docId);
    if (!proof) return { isValid: false, reason: 'Record not found in state tree' };
    const rawVal = this.memtable.get(String(docId));
    if (!rawVal) return { isValid: false, reason: 'Document missing' };
    const leafHash = crypto.createHash('sha256').update(rawVal).digest();
    const isValid = FlashMerkle.verifyProof(leafHash, proof.proof, proof.root);
    return {
      isValid,
      leafHash: leafHash.toString('hex'),
      root: proof.root
    };
  }

  /**
   * Insert multiple documents in high-speed batch
   * @param {Array<object>} docs
   * @returns {Promise<{ insertedCount: number, insertedIds: string[] }>}
   */
  async insertMany(docs) {
    const insertedIds = [];
    for (const doc of docs) {
      const res = await this.insertOne(doc);
      insertedIds.push(res.insertedId);
    }
    return {
      insertedCount: insertedIds.length,
      insertedIds
    };
  }

  /**
   * Finds documents matching a query envelope (Trapdoors, Range Buckets, or Raw IDs)
   * @param {object} queryEnvelope
   * @param {object} [options]
   * @param {number} [options.limit=100]
   * @param {number} [options.skip=0]
   * @returns {Promise<Array<object>>}
   */
  async find(queryEnvelope = {}, options = {}) {
    if (!this.isReady) await this.init();
    const limit = options.limit || 1000;
    const skip = options.skip || 0;

    let candidateIds = null;

    // 1. Point lookup by _id
    if (queryEnvelope._id) {
      const id = String(queryEnvelope._id);
      const buf = await this._getRawDoc(id);
      if (buf) {
        return [FlashBinary.deserialize(buf)];
      }
      return [];
    }

    // 2. Query using Exact Trapdoors
    if (queryEnvelope.$exact) {
      for (const [field, trapdoor] of Object.entries(queryEnvelope.$exact)) {
        const matches = this.indexManager.findExact(field, trapdoor);
        candidateIds = candidateIds === null ? new Set(matches) : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    // 3. Query using N-Gram Trapdoors ($regex / $substr)
    if (queryEnvelope.$ngrams) {
      for (const [field, tokenList] of Object.entries(queryEnvelope.$ngrams)) {
        const matches = this.indexManager.findNGrams(field, tokenList);
        candidateIds = candidateIds === null ? new Set(matches) : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    // 4. Query using Range Buckets ($gt, $lt)
    if (queryEnvelope.$range) {
      for (const [field, bucketTokens] of Object.entries(queryEnvelope.$range)) {
        const matches = this.indexManager.findRangeBuckets(field, bucketTokens);
        candidateIds = candidateIds === null ? new Set(matches) : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    // 5. Query using Plaintext fields ($plain)
    if (queryEnvelope.$plain) {
      const plainMatches = new Set();
      for (const id of this.docOrder) {
        const buf = await this._getRawDoc(id);
        if (buf) {
          const doc = FlashBinary.deserialize(buf);
          let matchesAll = true;
          if (doc._plain) {
            for (const [pk, pv] of Object.entries(queryEnvelope.$plain)) {
              if (doc._plain[pk] !== pv) {
                matchesAll = false;
                break;
              }
            }
          } else {
            matchesAll = false;
          }
          if (matchesAll) plainMatches.add(String(doc._id));
        }
      }
      candidateIds = candidateIds === null ? plainMatches : this._intersect(candidateIds, plainMatches);
      if (candidateIds.size === 0) return [];
    }

    // 6. If no indexes were queried, scan all active records across MemTable & SSTables
    const results = [];
    if (candidateIds === null) {
      for (const id of this.docOrder) {
        const buf = await this._getRawDoc(id);
        if (buf) {
          results.push(FlashBinary.deserialize(buf));
        }
      }
    } else {
      for (const id of candidateIds) {
        const buf = await this._getRawDoc(id);
        if (buf) {
          results.push(FlashBinary.deserialize(buf));
        }
      }
    }

    return results.slice(skip, skip + limit);
  }

  async findOne(queryEnvelope) {
    const results = await this.find(queryEnvelope, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async deleteOne(queryEnvelope) {
    const doc = await this.findOne(queryEnvelope);
    if (!doc) return { deletedCount: 0 };

    const docId = String(doc._id);
    await this.wal.append(WAL_OP.DELETE, docId, Buffer.alloc(0));
    this.memtable.delete(docId);
    this.indexManager.removeDocument(docId);

    const idx = this.docOrder.indexOf(docId);
    if (idx !== -1) this.docOrder.splice(idx, 1);
    this._rebuildMerkleTree();

    return { deletedCount: 1 };
  }

  _intersect(setA, setB) {
    const result = new Set();
    for (const item of setA) {
      if (setB.has(item)) result.add(item);
    }
    return result;
  }

  async count() {
    let activeCount = 0;
    for (const id of this.docOrder) {
      const buf = await this._getRawDoc(id);
      if (buf) activeCount++;
    }
    return activeCount;
  }

  /**
   * Triggers LSM-Tree compaction to merge SSTables and reclaim disk space
   * @returns {Promise<{ compacted: boolean, originalFiles: number, totalRecordsMerged: number }>}
   */
  async compact() {
    if (!this.isReady) await this.init();
    await this.flush(); // Flush any pending memtable first

    const { FlashCompactor } = await import('../engine/compactor.mjs');
    const compactor = new FlashCompactor();
    const res = await compactor.compactCollection(this);

    // Reload SSTables
    this.sstables = [];
    await this._loadExistingSSTables();

    return res;
  }
}


