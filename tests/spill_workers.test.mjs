import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashCollection } from "../src/core/collection.mjs";
import { FlashWorkerPool } from "../src/engine/worker_pool.mjs";
import { mergeSSTableFiles } from "../src/engine/compaction_merge.mjs";
import {
  FlashSpillAggregator,
  runGroupStage,
  wrapAsPipelineData,
} from "../src/engine/spill_aggregator.mjs";
import { FlashSSTable } from "../src/engine/sstable.mjs";

after(async () => {
  await FlashWorkerPool.getDefault().shutdown();
});

test("FlashWorkerPool - merge SSTables off main thread", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-worker-"));
  const pool = new FlashWorkerPool({ size: 1 });

  try {
    const entries1 = [{ key: "a", value: Buffer.from('{"v":1}') }];
    const entries2 = [{ key: "b", value: Buffer.from('{"v":2}') }];
    const f1 = path.join(tmpDir, "t1.sst");
    const f2 = path.join(tmpDir, "t2.sst");
    await FlashSSTable.write(f1, entries1, { level: 0 });
    await FlashSSTable.write(f2, entries2, { level: 0 });

    const merged = await pool.runMerge(tmpDir, [f1, f2], 1);
    assert.equal(merged.compacted, true);
    assert.ok(fs.existsSync(merged.path));

    const table = new FlashSSTable(merged.path, 1);
    await table.load();
    assert.equal(table.indexMap.size, 2);
    await table.close();
  } finally {
    await pool.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashSpillAggregator - spills large datasets to disk", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-spill-"));
  const agg = new FlashSpillAggregator({
    spillDir: tmpDir,
    memoryThreshold: 100,
  });

  try {
    for (let i = 0; i < 350; i++) {
      await agg.push({ _id: `d${i}`, n: i });
    }
    await agg.finalizeSpill();

    assert.ok(agg.isSpilled);
    assert.equal(agg.length, 350);

    const grouped = await runGroupStage(agg, {
      _id: null,
      total: { $sum: "$n" },
      count: { $count: 1 },
    });

    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].count, 350);
    assert.equal(grouped[0].total, (350 * 349) / 2);
  } finally {
    await agg.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashClient - spill-to-disk aggregation on large collection", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-agg-spill-"));

  try {
    const client = new FlashClient({
      secretKey: "spill_agg_test_key_2026",
      storagePath: tmpDir,
    });
    const orders = client.collection("orders");

    const batch = [];
    for (let i = 0; i < 800; i++) {
      batch.push({
        region: i % 4 === 0 ? "EU" : "US",
        amount: i % 100,
        qty: 1,
      });
    }
    await orders.insertMany(batch);

    const result = await orders.aggregate(
      [
        { $match: { region: "EU" } },
        {
          $group: {
            _id: "$region",
            totalAmount: { $sum: "$amount" },
            orderCount: { $count: 1 },
          },
        },
      ],
      { spillThreshold: 150 },
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]._id, "EU");
    assert.equal(result[0].orderCount, 200);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashCollection - background worker compaction scheduling", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-bg-compact-"));
  const col = new FlashCollection("metrics", tmpDir, {
    memtableThreshold: 64,
  });

  try {
    await col.init();
    for (let i = 0; i < 8; i++) {
      await col.insertOne({ _id: `m${i}`, v: i });
      await col.flush();
    }

    const files = (await fs.promises.readdir(col.storageDir)).filter((f) =>
      f.endsWith(".sst"),
    );
    assert.ok(files.length >= 4);

    await new Promise((r) => setTimeout(r, 1500));

    const stillValid = await col.findOne({ _id: "m0" });
    assert.ok(stillValid);
  } finally {
    await col.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("mergeSSTableFiles - inline merge matches worker output shape", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-merge-inline-"));

  try {
    const f1 = path.join(tmpDir, "a.sst");
    const f2 = path.join(tmpDir, "b.sst");
    await FlashSSTable.write(
      f1,
      [{ key: "x", value: Buffer.from("{}") }],
      { level: 0 },
    );
    await FlashSSTable.write(
      f2,
      [{ key: "y", value: Buffer.from("{}") }],
      { level: 0 },
    );

    const merged = await mergeSSTableFiles(tmpDir, [f1, f2], 1);
    assert.equal(merged.count, 2);
    assert.ok(fs.existsSync(merged.path));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
