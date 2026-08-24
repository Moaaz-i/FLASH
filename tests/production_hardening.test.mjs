import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  FlashClient,
  FlashInvariants,
  FlashReplicaSet,
  FlashTxLog,
  FlashQueryPlanner,
} from "../src/index.mjs";

test("FLASH hardening: collection invariants after bulk insert", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-invariants-"));

  try {
    const client = new FlashClient({
      secretKey: "invariants_secret",
      storagePath: tmpDir,
    });
    const users = client.collection("users");
    await users.insertMany([
      { name: "Alice", tenantId: "t1", status: "active" },
      { name: "Bob", tenantId: "t1", status: "inactive" },
      { name: "Carol", tenantId: "t2", status: "active" },
    ]);

    const report = await users.raw.verifyInvariants();
    assert.equal(report.valid, true, report.errors.join("; "));
    assert.equal(report.activeDocs, 3);
    assert.equal(report.registeredIds, 3);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH hardening: compound index + explain executionStats", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-explain-"));

  try {
    const client = new FlashClient({
      secretKey: "explain_secret",
      storagePath: tmpDir,
      fieldPolicy: {
        tenantId: "plaintext",
        status: "plaintext",
        name: "searchable",
      },
      allowPlaintextFields: true,
    });
    const orders = client.collection("orders");
    orders.createIndex({ tenantId: 1, status: 1 }, { name: "tenant_status" });

    await orders.insertMany([
      { tenantId: "t1", status: "open", name: "Order A", amount: 10 },
      { tenantId: "t1", status: "open", name: "Order B", amount: 20 },
      { tenantId: "t1", status: "closed", name: "Order C", amount: 30 },
      { tenantId: "t2", status: "open", name: "Order D", amount: 40 },
    ]);

    const plan = FlashQueryPlanner.plan(
      { $secondary: { tenantId: "t1", status: "open" } },
      orders.indexManager,
      new Set(),
      4,
    );
    assert.equal(plan.stage, "COMPOUND_INDEX");
    assert.equal(plan.indexName, "tenant_status");

    const explained = await orders
      .find({ tenantId: "t1", status: "open" })
      .explain()
      .exec();

    assert.equal(explained.executionStats.executionSuccess, true);
    assert.equal(explained.executionStats.nReturned, 2);
    assert.ok(explained.queryPlanner.winningPlan.indexName);
    assert.ok(explained.executionStats.totalKeysExamined >= 1);

    const hits = await orders.find({ tenantId: "t1", status: "open" }).exec();
    assert.equal(hits.length, 2);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH hardening: durable transaction log + session commit", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-txlog-"));

  try {
    const client = new FlashClient({
      secretKey: "txlog_secret",
      storagePath: tmpDir,
    });
    const ledger = client.collection("ledger");
    const session = client.startSession();

    session.startTransaction();
    await session.insert("ledger", { account: "A1", balance: 100 });
    await session.insert("ledger", { account: "A2", balance: 200 });
    await session.commitTransaction();

    const rows = await ledger.find().exec();
    assert.equal(rows.length, 2);

    const txLogPath = path.join(tmpDir, "flash_db", "sessions.txlog");
    assert.ok(fs.existsSync(txLogPath));

    const txLog = new FlashTxLog(txLogPath);
    await txLog.close();

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH hardening: 3-node replica set write + failover", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-replica-"));

  try {
    const rs = new FlashReplicaSet({
      name: "rs0",
      storageRoot: tmpDir,
      writeConcern: "majority",
    });

    rs.addNode("node1", ["node2", "node3"]);
    rs.addNode("node2", ["node1", "node3"]);
    rs.addNode("node3", ["node1", "node2"]);

    const election = rs.electLeader("node1");
    assert.equal(election.leaderId, "node1");
    assert.ok(election.votes >= 2);

    const doc = { _id: "doc-1", payload: "replicated-value", seq: 1 };
    const write = await rs.replicateInsert("events", doc);
    assert.equal(write.committed, true);
    assert.equal(write.replicated, 2);

    for (const nodeId of ["node1", "node2", "node3"]) {
      const col = rs.nodes.get(nodeId).db.collection("events");
      await col.init();
      const raw = await col._getRawDoc("doc-1");
      assert.ok(raw, `node ${nodeId} missing replicated doc`);
    }

    const failover = await rs.failover("node2");
    assert.equal(failover.leaderId, "node2");

    await rs.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH hardening: chaos recovery — invariants hold after flush", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-chaos-"));

  try {
    const client = new FlashClient({
      secretKey: "chaos_secret",
      storagePath: tmpDir,
    });
    const metrics = client.collection("metrics");

    for (let i = 0; i < 120; i++) {
      await metrics.insertOne({
        sensor: `s${i % 5}`,
        value: i,
        ts: Date.now(),
      });
    }

    await metrics.raw.flush();

    const report = await FlashInvariants.verify(metrics.raw);
    assert.equal(report.valid, true, report.errors.join("; "));
    assert.equal(report.activeDocs, 120);
    assert.ok(report.sstables >= 1);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
