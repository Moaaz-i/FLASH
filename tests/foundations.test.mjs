import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashPaginator } from "../src/engine/paginator.mjs";
import { FlashEventHub } from "../src/reactive/event_hub.mjs";

test("foundations: cursor pagination", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-page-"));
  const client = new FlashClient({
    secretKey: "foundations_pagination_key_32chars!",
    storagePath: tmpDir,
  });

  try {
    const col = client.collection("items");
    for (let i = 0; i < 25; i++) {
      await col.insertOne({
        n: i,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }

    const p1 = await col.paginate({}, { limit: 10, sort: { n: 1 } });
    assert.strictEqual(p1.docs.length, 10);
    assert.strictEqual(p1.docs[0].n, 0);
    assert.ok(p1.hasMore);
    assert.ok(p1.nextCursor);

    const p2 = await col.paginate(
      {},
      { limit: 10, sort: { n: 1 }, cursor: p1.nextCursor },
    );
    assert.strictEqual(p2.docs.length, 10);
    assert.strictEqual(p2.docs[0].n, 10);

    const cursor = FlashPaginator.decodeCursor(p1.nextCursor);
    assert.ok(cursor.id);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: lifecycle expiry and maxDocuments", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-life-"));
  const archivePath = path.join(tmpDir, "archive.ndjson");
  const client = new FlashClient({
    secretKey: "foundations_lifecycle_key_32chars!",
    storagePath: tmpDir,
  });

  try {
    const col = client.collection("events");
    const old = new Date(Date.now() - 86400000 * 10);
    const recent = new Date();

    for (let i = 0; i < 5; i++) {
      await col.insertOne({ label: `old-${i}`, createdAt: old });
    }
    for (let i = 0; i < 8; i++) {
      await col.insertOne({ label: `new-${i}`, createdAt: recent });
    }

    const lc = client.lifecycle("events", {
      expireAfterMs: 86400000 * 2,
      maxDocuments: 5,
      archivePath,
      timeField: "createdAt",
    });
    const result = await lc.sweep();

    assert.ok(result.expired >= 5);
    assert.ok(result.trimmed >= 0);
    assert.ok(await col.count() <= 5);
    if (fs.existsSync(archivePath)) {
      const lines = fs.readFileSync(archivePath, "utf8").trim().split("\n");
      assert.ok(lines.length >= 5);
    }
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: pipeline NDJSON import and export", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-pipe-"));
  const ndjson = path.join(tmpDir, "data.ndjson");
  const out = path.join(tmpDir, "out.ndjson");

  fs.writeFileSync(
    ndjson,
    '{"a":1,"createdAt":"2026-01-01"}\n{"a":2,"createdAt":"2026-01-02"}\n',
  );

  const client = new FlashClient({
    secretKey: "foundations_pipeline_key_32chars!",
    storagePath: path.join(tmpDir, "db"),
  });

  try {
    const imp = await client
      .pipeline()
      .fromNDJSON(ndjson)
      .toCollection("data")
      .batchSize(1)
      .run();
    assert.strictEqual(imp.importedCount, 2);

    const exp = await client
      .pipeline()
      .fromCollection("data")
      .toNDJSON(out)
      .run();
    assert.strictEqual(exp.exportedCount, 2);
    assert.ok(fs.existsSync(out));
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: event hub and plugins", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-ev-"));
  const client = new FlashClient({
    secretKey: "foundations_events_key_32chars!!",
    storagePath: tmpDir,
  });

  try {
    const events = [];
    client.events().subscribe("collection:logs:insert", (payload) => {
      events.push(payload);
    });

    client.use({
      name: "timestamps",
      beforeInsert(doc) {
        doc.createdAt = doc.createdAt || new Date("2026-06-01");
        return doc;
      },
    });

    const col = client.collection("logs");
    await col.insertOne({ msg: "hello" });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "insert");
    assert.ok(events[0].doc.createdAt);

    const hub = new FlashEventHub();
    let wild = 0;
    hub.subscribe("*", () => {
      wild++;
    });
    hub.publish("any:topic", { ok: true });
    assert.strictEqual(wild, 1);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: maintenance runNow flushes memtable", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-maint-"));
  const client = new FlashClient({
    secretKey: "foundations_maint_key_32chars!!!!",
    storagePath: tmpDir,
    engineOptions: { durability: "throughput" },
  });

  try {
    const col = client.collection("bulk");
    for (let i = 0; i < 50; i++) {
      await col.insertOne({ i, createdAt: new Date() });
    }
    assert.ok(col.raw.memtable.byteSize > 0);

    await client.maintenance().runNow();
    assert.strictEqual(col.raw.memtable.byteSize, 0);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: event log tail and counter", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-evlog-"));
  const client = new FlashClient({
    secretKey: "foundations_evlog_key_32chars!!!!",
    storagePath: tmpDir,
    autoTimestamps: false,
  });

  try {
    const log = client.eventLog("telemetry");
    await log.appendMany([{ kind: "a" }, { kind: "b" }, { kind: "c" }]);
    const tail = await log.tail({}, { limit: 2 });
    assert.strictEqual(tail.docs.length, 2);

    const counter = client.counter("page_views");
    assert.strictEqual(await counter.get(), 0);
    assert.strictEqual(await counter.increment(5), 5);
    assert.strictEqual(await counter.increment(3), 8);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: queue enqueue and dequeue", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-queue-"));
  const client = new FlashClient({
    secretKey: "foundations_queue_key_32chars!!!!",
    storagePath: tmpDir,
    autoTimestamps: false,
  });

  try {
    const q = client.queue("jobs");
    await q.enqueue({ task: "low" }, { priority: 1 });
    await q.enqueue({ task: "high" }, { priority: 10 });

    const first = await q.dequeue();
    assert.strictEqual(first.payload.task, "high");
    await q.ack(first._id);

    assert.strictEqual(await q.depth(), 1);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: health report and fast count", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-health-"));
  const client = new FlashClient({
    secretKey: "foundations_health_key_32chars!!!",
    storagePath: tmpDir,
  });

  try {
    const col = client.collection("items");
    await col.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]);
    assert.strictEqual(await col.count(), 3);

    const health = await client.health();
    assert.strictEqual(health.status, "ok");
    assert.ok(health.totalDocuments >= 3);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("foundations: TTL manager purges from SSTable-backed data", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-ttl-"));
  const client = new FlashClient({
    secretKey: "foundations_ttl_key_32chars!!!!!!",
    storagePath: tmpDir,
    fieldPolicy: { createdAt: "plaintext" },
    autoTimestamps: false,
  });

  try {
    const col = client.collection("logs");
    col.setSchema({}, { expireAfterSeconds: 30, ttlField: "createdAt" });
    await col.insertOne({ createdAt: new Date(Date.now() - 60000) });
    await col.raw.flush();

    const purged = await col.ttlManager.purgeExpired();
    assert.ok(purged >= 1);
    assert.strictEqual(await col.count(), 0);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
