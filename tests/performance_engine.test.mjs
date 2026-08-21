import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashArc, ARC_OP } from "../src/engine/arc.mjs";
import { FlashOplog } from "../src/engine/oplog.mjs";
import { FlashCollection } from "../src/core/collection.mjs";
import { FlashDatabase } from "../src/core/database.mjs";
import {
  DEFAULT_MEMTABLE_THRESHOLD,
  DEFAULT_DURABILITY,
  L0_COMPACT_TRIGGER,
  resolveDurability,
} from "../src/engine/perf_defaults.mjs";
import {
  resolveEngineOptions,
  TURBO_MEMTABLE_THRESHOLD,
} from "../src/engine/perf_profiles.mjs";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashRecordCodec } from "../src/client/record_codec.mjs";

test("perf defaults - balanced durability batches fsync", () => {
  const cfg = resolveDurability("balanced");
  assert.strictEqual(cfg.syncOnWrite, false);
  assert.strictEqual(cfg.batchSync, true);
  assert.ok(cfg.syncEveryOps >= 32);
});

test("perf defaults - memtable threshold is 4MB", () => {
  assert.strictEqual(DEFAULT_MEMTABLE_THRESHOLD, 4 * 1024 * 1024);
  assert.strictEqual(DEFAULT_DURABILITY, "balanced");
  assert.strictEqual(L0_COMPACT_TRIGGER, 8);
});

test("FlashArc appendBatch - single fsync for large batch (balanced)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-perf-arc-"));
  const arcPath = path.join(tmpDir, "batch.farc");

  try {
    const arc = new FlashArc(arcPath, { durability: "balanced" });
    await arc.open();

    let syncCount = 0;
    const origSync = arc.sync.bind(arc);
    arc.sync = async () => {
      syncCount++;
      return origSync();
    };

    const ops = Array.from({ length: 200 }, (_, i) => ({
      opCode: ARC_OP.INSERT,
      key: `k${i}`,
      data: Buffer.from(`v${i}`),
    }));
    await arc.appendBatch(ops);
    await arc.close();

    assert.ok(syncCount < 200, "batch append must not fsync per frame");
    assert.ok(syncCount >= 1, "close must flush pending writes");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashOplog appendBatch - batches durability sync", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-perf-oplog-"));
  const oplogPath = path.join(tmpDir, "batch.flog");

  try {
    const oplog = new FlashOplog(oplogPath, { durability: "balanced" });
    await oplog.open();

    let syncCount = 0;
    const origSync = oplog.sync.bind(oplog);
    oplog.sync = async () => {
      syncCount++;
      return origSync();
    };

    const entries = Array.from({ length: 150 }, (_, i) => ({
      operationType: "insert",
      collectionName: "items",
      docId: `doc_${i}`,
    }));
    await oplog.appendBatch(entries);
    await oplog.close();

    assert.ok(syncCount < 150, "oplog batch must not fsync per entry");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashCollection insertMany - batches WAL writes (single appendBatch)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-perf-col-"));
  const col = new FlashCollection("bench", tmpDir, {
    durability: "balanced",
    deferMerkleOnWrite: true,
  });

  try {
    await col.init();
    const docs = Array.from({ length: 80 }, (_, i) => ({
      _id: `id_${i}`,
      _enc: { n: i },
      _blind: {},
    }));

    let appendCalls = 0;
    let batchCalls = 0;
    const origAppend = col.wal.append.bind(col.wal);
    const origBatch = col.wal.appendBatch.bind(col.wal);
    col.wal.append = async (...args) => {
      appendCalls += 1;
      return origAppend(...args);
    };
    col.wal.appendBatch = async (...args) => {
      batchCalls += 1;
      return origBatch(...args);
    };

    const res = await col.insertMany(docs, { skipOplog: true });
    assert.equal(res.insertedCount, 80);
    assert.equal(batchCalls, 1, "insertMany must use one WAL appendBatch");
    assert.equal(appendCalls, 0, "insertMany must not call WAL append per row");

    let singleAppendCalls = 0;
    col.wal.append = async (...args) => {
      singleAppendCalls += 1;
      return origAppend(...args);
    };

    await col.insertOne(
      { _id: "solo", _enc: { n: 99 }, _blind: {} },
      { skipOplog: true },
    );
    assert.equal(singleAppendCalls, 1, "insertOne uses WAL append once");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashDatabase - engineOptions propagate to collection", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-perf-db-"));

  try {
    const db = new FlashDatabase("perf_db", {
      storagePath: tmpDir,
      engineOptions: {
        memtableThreshold: 8192,
        durability: "strict",
        useWorkerFlush: false,
      },
    });
    const col = db.collection("data");
    await col.init();

    assert.strictEqual(col.memtableThreshold, 8192);
    assert.strictEqual(col.deferMerkleOnWrite, true);
    assert.strictEqual(col.useWorkerFlush, false);
    assert.strictEqual(col.arc.syncOnWrite, true);

    await db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resolveEngineOptions - turbo profile", () => {
  const opts = resolveEngineOptions({ performanceProfile: "turbo" });
  assert.strictEqual(opts.durability, "throughput");
  assert.strictEqual(opts.memtableThreshold, TURBO_MEMTABLE_THRESHOLD);
  assert.strictEqual(opts.disableMerkle, true);
  assert.strictEqual(opts.performanceProfile, "turbo");
});

test("FlashDatabase - inMemory mode uses no disk directory", async () => {
  const db = new FlashDatabase("mem_db", { inMemory: true });
  const col = db.collection("items");
  await col.init();

  assert.strictEqual(db.inMemory, true);
  assert.strictEqual(col.inMemory, true);
  assert.strictEqual(col.disableMerkle, false);

  await col.insertOne(
    { _id: "a1", _enc: { n: 1 }, _blind: {} },
    { skipOplog: true },
  );
  const found = await col.find({ _id: "a1" });
  assert.strictEqual(found.length, 1);

  assert.deepStrictEqual(db.listCollections(), ["items"]);
  await db.close();
});

test("FlashClient - turbo inMemory insert and partial decrypt", async () => {
  const client = new FlashClient({
    secretKey: "perf_test_key_123",
    inMemory: true,
    engineOptions: { performanceProfile: "turbo" },
  });

  const col = client.collection("perf");
  await col.insertMany([
    { name: "Alice", email: "alice@test.com", score: 10 },
    { name: "Bob", email: "bob@test.com", score: 20 },
  ]);

  const projected = await col.find({}).select("name email").exec();
  assert.strictEqual(projected.length, 2);
  assert.strictEqual(projected[0].name, "Alice");
  assert.ok(!("score" in projected[0]));

  const buf = client.encryptToBuffer({ name: "Carol", secret: "hidden" });
  const partial = FlashRecordCodec.decryptFields(client, buf, ["name"]);
  assert.strictEqual(partial.name, "Carol");
  assert.ok(!("secret" in partial));
});
