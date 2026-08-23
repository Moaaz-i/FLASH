import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { FlashMemTable } from "../engine/memtable.mjs";
import { FlashArc, ARC_OP, WAL_OP } from "../engine/arc.mjs";
import { FlashSSTable, fsyncDir } from "../engine/sstable.mjs";
import { FlashIndexManager } from "../engine/index_manager.mjs";
import { FlashIndexPersistence } from "../engine/index_persistence.mjs";
import { FlashOplog } from "../engine/oplog.mjs";
import { FlashMVCC } from "../transactions/mvcc.mjs";
import { FlashQueryPlanner } from "../engine/query_planner.mjs";
import { FlashInvariants } from "../engine/invariants.mjs";
import { FlashBinary } from "../binary/flash_binary.mjs";
import { FlashMerkle } from "../crypto/merkle.mjs";
import { FlashWorkerPool } from "../engine/worker_pool.mjs";
import {
  DEFAULT_MEMTABLE_THRESHOLD,
  DEFAULT_DURABILITY,
  L0_COMPACT_TRIGGER,
} from "../engine/perf_defaults.mjs";
import { MemoryArc } from "../storage/memory_arc.mjs";
import { MemoryOplog } from "../storage/memory_oplog.mjs";
import { MemorySSTable } from "../storage/memory_sstable.mjs";
import { logger } from "./logger.mjs";

/**
 * FLASH Collection Engine (FlashCollection)
 * LSM-Tree with persistent indexes, MVCC, oplog, and query planning.
 */
export class FlashCollection {
  constructor(name, storageDir, options = {}) {
    this.name = name;
    this.storageDir = path.join(storageDir, name);
    this.memtableThreshold =
      options.memtableThreshold ?? DEFAULT_MEMTABLE_THRESHOLD;
    this.memtable = new FlashMemTable();
    this.indexManager = new FlashIndexManager();
    this.secondaryIndexManager = options.secondaryIndexManager || null;
    const durability = options.durability ?? DEFAULT_DURABILITY;
    this.inMemory = options.inMemory === true;
    this.disableMerkle = options.disableMerkle === true;
    this.skipIndexPersist =
      options.skipIndexPersist === true || this.inMemory;
    this.deferMerkleOnWrite = options.deferMerkleOnWrite !== false;
    this._lastMerkleRoot = "";

    if (this.inMemory) {
      this.arc = new MemoryArc();
      this.wal = this.arc;
      this.oplog = new MemoryOplog();
    } else {
      this.arc = new FlashArc(path.join(this.storageDir, "commit.farc"), {
        durability,
      });
      this.wal = this.arc;
      this.oplog = new FlashOplog(path.join(this.storageDir, "oplog.flog"), {
        durability,
      });
    }
    this.mvcc = options.mvcc || new FlashMVCC();
    this.sstables = [];
    this.merkleTree = null;
    this.docOrder = [];
    this.docIdSet = new Set();
    this.isMerkleDirty = false;
    this.isReady = false;
    this._persistTimer = null;
    this._activeTxId = null;
    this._compacting = false;
    this.useWorkerFlush = options.useWorkerFlush !== false;
    this.compressionLevel = options.compressionLevel ?? 1;
    this.workerPool = options.workerPool || FlashWorkerPool.getDefault();
    this.trashVault = options.trashVault || null;
    this.deletionLog = options.deletionLog || null;
  }

  _trackDocId(docId) {
    const id = String(docId);
    if (!this.docIdSet.has(id)) {
      this.docIdSet.add(id);
      this.docOrder.push(id);
    }
  }

  _untrackDocId(docId) {
    const id = String(docId);
    if (this.docIdSet.delete(id)) {
      const idx = this.docOrder.indexOf(id);
      if (idx !== -1) this.docOrder.splice(idx, 1);
    }
  }

  _schedulePersistIndexes() {
    if (this.skipIndexPersist) return;
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(async () => {
      this._persistTimer = null;
      try {
        await FlashIndexPersistence.save(this.storageDir, {
          indexManager: this.indexManager,
          secondaryManager: this.secondaryIndexManager,
          docIds: this.docIdSet,
        });
      } catch (err) {
        logger.warn("FlashCollection", "index persist failed", {
          collection: this.name,
          error: err.message,
        });
      }
    }, 100);
  }

  async init() {
    if (this.isReady) return;
    logger.info("FlashCollection", "initializing", { collection: this.name });

    if (!this.inMemory) {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      const persistedIds = await FlashIndexPersistence.load(this.storageDir, {
        indexManager: this.indexManager,
        secondaryManager: this.secondaryIndexManager,
      });
      if (persistedIds) {
        for (const id of persistedIds) {
          this._trackDocId(id);
        }
      }

      await this._loadExistingSSTables();
    }

    await this.oplog.open();

    let replayed = 0;
    await this.arc.open();
    await this.arc.recover((opCode, key, dataBuf) => {
      if (opCode === ARC_OP.INSERT || opCode === ARC_OP.UPDATE) {
        this.memtable.set(key, dataBuf);
        try {
          const blind = FlashBinary.getField(dataBuf, "_blind");
          if (blind) this.indexManager.indexDocument(key, blind);
          this._trackDocId(key);
          replayed++;
        } catch {}
      } else if (opCode === ARC_OP.DELETE) {
        this.memtable.delete(key);
        this.indexManager.removeDocument(key);
        this._untrackDocId(key);
      }
    });

    this.isMerkleDirty = true;
    this.isReady = true;
    logger.info("FlashCollection", "ready", {
      collection: this.name,
      sstables: this.sstables.length,
      walReplayed: replayed,
    });
  }

  async _loadExistingSSTables() {
    if (!fs.existsSync(this.storageDir)) return;
    const allFiles = await fs.promises.readdir(this.storageDir);

    for (const f of allFiles) {
      if (f.endsWith(".sst.tmp") || f.endsWith(".tmp")) {
        try {
          await fs.promises.unlink(path.join(this.storageDir, f));
        } catch {}
      }
    }

    const sstFiles = allFiles
      .filter((f) => f.endsWith(".sst") && !f.includes(".tmp"))
      .sort((a, b) => {
        const levelA = a.includes("_L")
          ? parseInt(a.match(/_L(\d+)/)?.[1] || "0", 10)
          : 0;
        const levelB = b.includes("_L")
          ? parseInt(b.match(/_L(\d+)/)?.[1] || "0", 10)
          : 0;
        if (levelA !== levelB) return levelA - levelB;
        return a.localeCompare(b);
      });

    for (const f of sstFiles) {
      const sstPath = path.join(this.storageDir, f);
      try {
        const levelMatch = f.match(/_L(\d+)_/);
        const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
        const sstable = new FlashSSTable(sstPath, level);
        await sstable.load();
        this.sstables.unshift(sstable);
        for (const [key] of sstable.indexMap.entries()) {
          this._trackDocId(key);
        }
      } catch (err) {
        logger.warn("FlashCollection", "skipping corrupt SSTable", {
          collection: this.name,
          file: f,
          error: err.message,
        });
      }
    }
  }

  async _rebuildMerkleTree() {
    if (this.disableMerkle) return;
    const leafHashes = [];
    for (const id of this.docOrder) {
      const raw = await this._getRawDoc(id);
      if (raw) {
        leafHashes.push(crypto.createHash("sha256").update(raw).digest("hex"));
      }
    }
    this.merkleTree = new FlashMerkle(leafHashes);
  }

  beginEngineTransaction(txId = null) {
    const tx = this.mvcc.beginTransaction(txId);
    this._activeTxId = tx.txId;
    return tx;
  }

  async commitEngineTransaction(txId) {
    const result = this.mvcc.commit(txId);
    this._activeTxId = null;
    return result;
  }

  abortEngineTransaction(txId) {
    this.mvcc.abort(txId);
    if (this._activeTxId === txId) this._activeTxId = null;
  }

  async applyRawInsert(docId, binaryBuf, blindPayload = null, options = {}) {
    if (!this.isReady) await this.init();
    await this.wal.append(WAL_OP.INSERT, String(docId), binaryBuf);
    this.memtable.set(String(docId), binaryBuf, binaryBuf.length);
    if (blindPayload)
      this.indexManager.indexDocument(String(docId), blindPayload);
    this._trackDocId(String(docId));
    this.isMerkleDirty = true;
    if (!options.skipOplog) {
      await this.oplog.append("insert", this.name, String(docId));
    }
    this._schedulePersistIndexes();
  }

  async verifyInvariants() {
    return FlashInvariants.verify(this);
  }

  async insertOne(docOrBuf, options = {}) {
    if (!this.isReady) await this.init();

    let binaryBuf;
    let docId;

    if (Buffer.isBuffer(docOrBuf)) {
      binaryBuf = docOrBuf;
      docId = FlashBinary.getField(binaryBuf, "_id");
      if (docId == null) {
        throw new Error("Buffer record must include _id before insert");
      }
      docId = String(docId);
    } else {
      if (!docOrBuf._id) {
        docOrBuf._id = crypto.randomUUID();
      }
      docId = String(docOrBuf._id);
      binaryBuf = FlashBinary.serialize(docOrBuf);
    }

    await this.wal.append(WAL_OP.INSERT, docId, binaryBuf);
    this.memtable.set(docId, binaryBuf, binaryBuf.length);

    const blind = Buffer.isBuffer(docOrBuf)
      ? FlashBinary.getField(binaryBuf, "_blind")
      : docOrBuf._blind;
    if (blind) {
      this.indexManager.indexDocument(docId, blind);
    }

    this._trackDocId(docId);
    this.isMerkleDirty = true;

    if (!options.skipOplog) {
      await this.oplog.append("insert", this.name, docId);
    }

    this._schedulePersistIndexes();

    if (this.memtable.byteSize >= this.memtableThreshold) {
      await this.flush();
    }

    return {
      insertedId: docId,
      merkleRoot: this.disableMerkle
        ? ""
        : await this._getMerkleRootAccurate(),
    };
  }

  async insertMany(docs, options = {}) {
    if (!this.isReady) await this.init();
    if (docs.length === 0) return { insertedCount: 0, insertedIds: [] };

    const walOps = [];
    const prepared = [];
    const oplogEntries = [];

    for (const docOrBuf of docs) {
      let docId;
      let binaryBuf;

      if (Buffer.isBuffer(docOrBuf)) {
        binaryBuf = docOrBuf;
        docId = FlashBinary.getField(binaryBuf, "_id");
        if (docId == null) {
          throw new Error("Buffer record must include _id before insertMany");
        }
        docId = String(docId);
      } else {
        if (!docOrBuf._id) docOrBuf._id = crypto.randomUUID();
        docId = String(docOrBuf._id);
        binaryBuf = FlashBinary.serialize(docOrBuf);
      }

      walOps.push({ opCode: WAL_OP.INSERT, key: docId, data: binaryBuf });
      prepared.push({ docId, binaryBuf });
    }

    await this.wal.appendBatch(walOps);

    const insertedIds = [];
    for (const { docId, binaryBuf } of prepared) {
      this.memtable.set(docId, binaryBuf, binaryBuf.length);
      const blind = FlashBinary.getField(binaryBuf, "_blind");
      if (blind) this.indexManager.indexDocument(docId, blind);
      this._trackDocId(docId);
      insertedIds.push(docId);
      if (!options.skipOplog) {
        oplogEntries.push({
          operationType: "insert",
          collectionName: this.name,
          docId,
        });
      }
    }

    if (oplogEntries.length > 0) {
      await this.oplog.appendBatch(oplogEntries);
    }

    this.isMerkleDirty = true;
    this._schedulePersistIndexes();

    if (this.memtable.byteSize >= this.memtableThreshold) {
      await this.flush();
    }

    return { insertedCount: insertedIds.length, insertedIds };
  }

  async flush() {
    if (!this.isReady) await this.init();
    const entries = this.memtable.entries();
    if (entries.length === 0) return null;

    const t0 = Date.now();

    let sstable;
    if (this.inMemory) {
      sstable = MemorySSTable.fromEntries(entries, 0);
    } else {
      const timestamp = Date.now();
      const sstPath = path.join(
        this.storageDir,
        `sstable_L0_${timestamp}_${this.sstables.length + 1}.sst`,
      );

      if (this.useWorkerFlush && entries.length >= 512) {
        await this.workerPool.runFlush(sstPath, entries, 0);
        sstable = new FlashSSTable(sstPath, 0);
        await sstable.load();
      } else {
        sstable = await FlashSSTable.write(sstPath, entries, {
          level: 0,
          compressionLevel: this.compressionLevel,
        });
      }
    }
    this.sstables.unshift(sstable);

    this.memtable.clear();
    await this.wal.truncate();
    if (!this.skipIndexPersist) {
      await this._schedulePersistIndexesImmediate();
    }

    logger.info("FlashCollection", "flush completed", {
      collection: this.name,
      records: entries.length,
      sstables: this.sstables.length,
      durationMs: Date.now() - t0,
    });

    if (!this.disableMerkle) {
      await this._rebuildMerkleTree();
      this._lastMerkleRoot = this.merkleTree ? this.merkleTree.getRoot() : "";
      this.isMerkleDirty = false;
    }

    if (
      !this.inMemory &&
      this._countSSTablesAtLevel(0) >= L0_COMPACT_TRIGGER
    ) {
      this._scheduleBackgroundCompact();
    }

    return sstable;
  }

  _scheduleBackgroundCompact() {
    if (this.inMemory || this._compacting) return;
    this._compacting = true;

    setImmediate(async () => {
      try {
        await this.flush();
        const l0Tables = this.sstables.filter((s) => (s.level || 0) === 0);
        if (l0Tables.length < L0_COMPACT_TRIGGER) return;

        const filePaths = l0Tables.map((s) => s.filePath);
        const merged = await this.workerPool.runMerge(
          this.storageDir,
          filePaths,
          1,
        );

        if (!merged.compacted || !merged.path) return;

        for (const fp of filePaths) {
          try {
            await fs.promises.unlink(fp);
          } catch {}
        }
        for (const sst of l0Tables) {
          await sst.close();
        }

        this.sstables = this.sstables.filter(
          (s) => !filePaths.includes(s.filePath),
        );
        const newTable = new FlashSSTable(merged.path, 1);
        await newTable.load();
        this.sstables.unshift(newTable);
        await fsyncDir(this.storageDir);

        logger.info("FlashCollection", "background compaction completed", {
          collection: this.name,
          mergedRecords: merged.count,
          level: 1,
        });
      } catch (err) {
        logger.warn("FlashCollection", "background compaction failed", {
          collection: this.name,
          error: err.message,
        });
      } finally {
        this._compacting = false;
      }
    });
  }

  _countSSTablesAtLevel(level) {
    return this.sstables.filter((s) => s.level === level).length;
  }

  async _schedulePersistIndexesImmediate() {
    if (this.skipIndexPersist) return;
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    await FlashIndexPersistence.save(this.storageDir, {
      indexManager: this.indexManager,
      secondaryManager: this.secondaryIndexManager,
      docIds: this.docIdSet,
    });
  }

  async _getRawDoc(docId) {
    if (!this.isReady) await this.init();

    const memVal = this.memtable.get(docId);
    if (memVal) {
      return memVal._tombstone ? null : memVal;
    }

    for (const sst of this.sstables) {
      const sstVal = await sst.get(docId);
      if (sstVal) return sstVal;
    }

    return null;
  }

  getMerkleRoot() {
    if (this.disableMerkle) return "";
    if (this.merkleTree && !this.isMerkleDirty) {
      return this.merkleTree.getRoot();
    }

    const leafHashes = [];
    for (const id of this.docOrder) {
      const memVal = this.memtable.get(id);
      if (memVal && !memVal._tombstone) {
        leafHashes.push(
          crypto.createHash("sha256").update(memVal).digest("hex"),
        );
      }
    }

    if (leafHashes.length === this.docOrder.length) {
      this.merkleTree = new FlashMerkle(leafHashes.length ? leafHashes : [""]);
      this.isMerkleDirty = false;
      this._lastMerkleRoot = this.merkleTree.getRoot();
      return this._lastMerkleRoot;
    }

    return this._lastMerkleRoot || "";
  }

  async _getMerkleRootAccurate() {
    if (this.disableMerkle) return "";
    const allInMem = this.docOrder.every((id) => {
      const v = this.memtable.get(id);
      return v && !v._tombstone;
    });
    if (allInMem) {
      return this.getMerkleRoot();
    }
    if (this.deferMerkleOnWrite && this._lastMerkleRoot) {
      return this._lastMerkleRoot;
    }
    await this._rebuildMerkleTree();
    this.isMerkleDirty = false;
    this._lastMerkleRoot = this.merkleTree ? this.merkleTree.getRoot() : "";
    return this._lastMerkleRoot;
  }

  async refreshMerkleRoot() {
    await this._rebuildMerkleTree();
    this.isMerkleDirty = false;
    return this.merkleTree ? this.merkleTree.getRoot() : "";
  }

  getMerkleProof(docId) {
    if (this.isMerkleDirty || !this.merkleTree) {
      return null;
    }
    const idx = this.docOrder.indexOf(String(docId));
    if (idx === -1 || !this.merkleTree) return null;
    return {
      index: idx,
      proof: this.merkleTree.getProof(idx),
      root: this.merkleTree.getRoot(),
    };
  }

  async getMerkleProofAsync(docId) {
    await this._rebuildMerkleTree();
    this.isMerkleDirty = false;
    return this.getMerkleProof(docId);
  }

  verifyRecordIntegrity(docId) {
    return this.verifyRecordIntegrityAsync(docId);
  }

  async verifyRecordIntegrityAsync(docId) {
    await this._rebuildMerkleTree();
    this.isMerkleDirty = false;
    const proof = this.getMerkleProof(docId);
    if (!proof)
      return { isValid: false, reason: "Record not found in state tree" };
    const rawVal = await this._getRawDoc(String(docId));
    if (!rawVal) return { isValid: false, reason: "Document missing" };
    const leafHash = crypto.createHash("sha256").update(rawVal).digest();
    const isValid = FlashMerkle.verifyProof(leafHash, proof.proof, proof.root);
    return { isValid, leafHash: leafHash.toString("hex"), root: proof.root };
  }

  _availableIndexFields() {
    const fields = new Set(["_id"]);
    for (const field of this.indexManager.exactIndexes.keys())
      fields.add(field);
    for (const field of this.indexManager.ngramIndexes.keys())
      fields.add(field);
    for (const field of this.indexManager.rangeIndexes.keys())
      fields.add(field);
    if (this.secondaryIndexManager) {
      for (const idx of this.secondaryIndexManager.indexes.values()) {
        for (const f of idx.fields) fields.add(f);
      }
    }
    return fields;
  }

  async find(queryEnvelope = {}, options = {}) {
    if (!this.isReady) await this.init();
    const limit = options.limit ?? 1000;
    const skip = options.skip ?? 0;
    const stats = options.stats || null;

    const plan = FlashQueryPlanner.plan(
      queryEnvelope,
      this.secondaryIndexManager,
      this._availableIndexFields(),
      this.docIdSet.size,
    );
    if (stats) {
      stats.plan = plan.plan;
      stats.stage = plan.stage;
      stats.indexName = plan.indexName;
      stats.fields = plan.fields;
      stats.covered = plan.covered;
      stats.keysExamined = 0;
      stats.docsExamined = 0;
    }

    let candidateIds = null;

    if (queryEnvelope._id || plan.plan === "POINT_LOOKUP") {
      const id = String(queryEnvelope._id);
      const buf = await this._getRawDoc(id);
      if (stats) {
        stats.keysExamined = 1;
        stats.docsExamined = buf ? 1 : 0;
      }
      return buf ? [buf] : [];
    }

    if (queryEnvelope.$exact) {
      for (const [field, trapdoor] of Object.entries(queryEnvelope.$exact)) {
        const matches = this.indexManager.findExact(field, trapdoor);
        if (stats) stats.keysExamined += matches.size;
        candidateIds =
          candidateIds === null
            ? new Set(matches)
            : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    if (queryEnvelope.$ngrams) {
      for (const [field, tokenList] of Object.entries(queryEnvelope.$ngrams)) {
        const matches = this.indexManager.findNGrams(field, tokenList);
        if (stats) stats.keysExamined += matches.size;
        candidateIds =
          candidateIds === null
            ? new Set(matches)
            : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    if (queryEnvelope.$range) {
      for (const [field, bucketTokens] of Object.entries(
        queryEnvelope.$range,
      )) {
        const matches = this.indexManager.findRangeBuckets(field, bucketTokens);
        if (stats) stats.keysExamined += matches.size;
        candidateIds =
          candidateIds === null
            ? new Set(matches)
            : this._intersect(candidateIds, matches);
        if (candidateIds.size === 0) return [];
      }
    }

    if (queryEnvelope.$secondary && this.secondaryIndexManager) {
      const compound = this.secondaryIndexManager.findBestIndexForQuery(
        queryEnvelope.$secondary,
      );
      if (compound) {
        const key = compound.fields
          .map((f) => JSON.stringify(queryEnvelope.$secondary[f]))
          .join("|");
        const idx = this.secondaryIndexManager.indexes.get(compound.indexName);
        const ids = idx?.map.get(key);
        const matches = ids ? Array.from(ids) : [];
        if (stats) stats.keysExamined += matches.length;
        candidateIds =
          candidateIds === null
            ? new Set(matches)
            : this._intersect(candidateIds, new Set(matches));
        if (candidateIds.size === 0) return [];
      } else {
        for (const [field, value] of Object.entries(queryEnvelope.$secondary)) {
          const matches = this.secondaryIndexManager.lookup(field, value);
          if (matches !== null) {
            if (stats) stats.keysExamined += matches.length;
            candidateIds =
              candidateIds === null
                ? new Set(matches)
                : this._intersect(candidateIds, new Set(matches));
            if (candidateIds.size === 0) return [];
          }
        }
      }
    }

    if (queryEnvelope.$plain) {
      const plainMatches = new Set();
      const idsToScan = candidateIds || this.docIdSet;
      for (const id of idsToScan) {
        if (stats) stats.docsExamined++;
        const buf = await this._getRawDoc(id);
        if (!buf) continue;
        const plain = FlashBinary.getField(buf, "_plain");
        let matchesAll = !!plain;
        if (plain) {
          for (const [pk, pv] of Object.entries(queryEnvelope.$plain)) {
            if (plain[pk] !== pv) {
              matchesAll = false;
              break;
            }
          }
        }
        const recordId = FlashBinary.getField(buf, "_id") ?? id;
        if (matchesAll) plainMatches.add(String(recordId));
      }
      candidateIds =
        candidateIds === null
          ? plainMatches
          : this._intersect(candidateIds, plainMatches);
      if (candidateIds.size === 0) return [];
    }

    if (queryEnvelope.$ids) {
      const idSet = new Set(queryEnvelope.$ids.map(String));
      if (stats) stats.keysExamined += idSet.size;
      candidateIds =
        candidateIds === null ? idSet : this._intersect(candidateIds, idSet);
    }

    const results = [];
    const idsToFetch = candidateIds === null ? this.docOrder : candidateIds;
    let skipped = 0;

    if (candidateIds === null && stats) {
      stats.docsExamined = 0;
    }

    for (const id of idsToFetch) {
      const buf = await this._getRawDoc(id);
      if (!buf) continue;
      if (candidateIds !== null && stats) stats.docsExamined++;
      if (skipped < skip) {
        skipped++;
        continue;
      }
      results.push(buf);
      if (results.length >= limit) break;
    }

    if (stats) stats.nReturned = results.length;
    return results;
  }

  async findOne(queryEnvelope) {
    const results = await this.find(queryEnvelope, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async deleteOne(queryEnvelope, options = {}) {
    const buf = await this.findOne(queryEnvelope);
    if (!buf) return { deletedCount: 0 };

    const docId = String(FlashBinary.getField(buf, "_id") ?? queryEnvelope._id);

    if (!options.skipTrash && this.trashVault) {
      await this.trashVault.archive({
        collection: this.name,
        docId,
        buffer: buf,
      });
    }

    if (!options.skipDeletionLog && this.deletionLog) {
      await this.deletionLog.append({
        collection: this.name,
        docId,
        action: "delete",
        restorable: Boolean(this.trashVault?.enabled),
      });
    }

    await this.wal.append(WAL_OP.DELETE, docId, Buffer.alloc(0));
    this.memtable.delete(docId);
    this.indexManager.removeDocument(docId);
    this._untrackDocId(docId);
    this.isMerkleDirty = true;
    await this.oplog.append("delete", this.name, docId);
    this._schedulePersistIndexes();

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
    for (const id of this.docIdSet) {
      if (await this._getRawDoc(id)) activeCount++;
    }
    return activeCount;
  }

  async compact() {
    if (!this.isReady) await this.init();
    await this.flush();

    const { FlashCompactor } = await import("../engine/compactor.mjs");
    const compactor = new FlashCompactor();
    const res = await compactor.compactCollection(this, { force: true });

    for (const sst of this.sstables) {
      await sst.close();
    }
    this.sstables = [];
    await this._loadExistingSSTables();

    return res;
  }

  async close() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    if (this._compacting) {
      this._compacting = false;
    }
    if (!this.skipIndexPersist) {
      try {
        await this._schedulePersistIndexesImmediate();
      } catch {
        // best effort on shutdown
      }
    }
    for (const sst of this.sstables) {
      await sst.close();
    }
    if (this.oplog && typeof this.oplog.close === 'function') {
      await this.oplog.close();
    }
    if (this.wal && typeof this.wal.close === 'function') {
      await this.wal.close();
    }
  }
}
