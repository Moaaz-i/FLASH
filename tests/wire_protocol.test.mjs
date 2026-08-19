import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

import {
  FlashDatabase,
  FlashWireServer,
  FlashWireClient,
  FlashReplicaSet,
  FlashReplicationClient,
  FlashTxLog,
  FlashBSON,
} from "../src/index.mjs";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

test("FLASH wire: handshake + find + insert + count", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-wire-"));
  const port = await getFreePort();

  const db = new FlashDatabase("wire_test", { storagePath: tmpDir });
  const server = new FlashWireServer(db, {
    port,
    host: "127.0.0.1",
    replicaSet: "flash_rs",
  });

  try {
    await server.start();
    await new Promise((r) => setTimeout(r, 50));
    const client = new FlashWireClient("127.0.0.1", port);

    const handshake = await client.command({ flashHello: 1, $db: "admin" });
    assert.equal(handshake.ok, 1);
    assert.equal(handshake.engine, "FLASH");
    assert.equal(handshake.isWritablePrimary, true);
    assert.equal(handshake.setName, "flash_rs");

    const insert = await client.command({
      insert: "users",
      documents: [{ name: "Alice", age: 30 }],
      $db: "wire_test",
    });
    assert.equal(insert.ok, 1);
    assert.equal(insert.n, 1);

    const found = await client.command({
      find: "users",
      filter: { name: "Alice" },
      $db: "wire_test",
    });
    assert.equal(found.ok, 1);
    assert.equal(found.cursor.firstBatch.length, 1);
    assert.equal(found.cursor.firstBatch[0].name, "Alice");

    const counted = await client.command({
      count: "users",
      query: { name: "Alice" },
      $db: "wire_test",
    });
    assert.equal(counted.n, 1);
  } finally {
    await server.stop();
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH wire: aggregate pipeline", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-wire-agg-"));
  const port = await getFreePort();
  const db = new FlashDatabase("agg_test", { storagePath: tmpDir });
  const server = new FlashWireServer(db, { port, host: "127.0.0.1" });

  try {
    await server.start();
    await new Promise((r) => setTimeout(r, 50));
    const client = new FlashWireClient("127.0.0.1", port);

    await client.command({
      insert: "scores",
      documents: [
        { team: "A", pts: 10 },
        { team: "A", pts: 20 },
        { team: "B", pts: 5 },
      ],
      $db: "agg_test",
    });

    const agg = await client.command({
      aggregate: "scores",
      pipeline: [{ $match: { team: "A" } }, { $project: { team: 1, pts: 1 } }],
      cursor: {},
      $db: "agg_test",
    });
    assert.equal(agg.ok, 1);
    assert.equal(agg.cursor.firstBatch.length, 2);
  } finally {
    await server.stop();
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Network replication: TCP applyInsert across nodes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-net-repl-"));
  const port = 6750 + Math.floor(Math.random() * 200);

  const rs = new FlashReplicaSet({
    name: "net_rs",
    storageRoot: tmpDir,
    network: true,
    writeConcern: "majority",
  });

  rs.addNode("leader", ["follower"], { port: port + 1 });
  rs.addNode("follower", ["leader"], { port });

  try {
    await rs.startNetworkNodes();
    rs.electLeader("leader");

    const write = await rs.replicateInsert("events", {
      _id: "evt-1",
      type: "click",
      value: 42,
    });
    assert.equal(write.committed, true);
    assert.equal(write.replicated, 1);

    const followerDb = rs.nodes.get("follower").db;
    const col = followerDb.collection("events");
    await col.init();
    const raw = await col._getRawDoc("evt-1");
    assert.ok(raw);

    const rpc = new FlashReplicationClient("127.0.0.1", port);
    const pong = await rpc.ping();
    assert.equal(pong.pong, true);
  } finally {
    await rs.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Tx recovery: replay prepared transactions after crash", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-tx-recover-"));
  const dbPath = path.join(tmpDir, "recover_db");
  fs.mkdirSync(dbPath, { recursive: true });

  const txLogPath = path.join(dbPath, "sessions.txlog");
  const txLog = new FlashTxLog(txLogPath);
  await txLog.appendPrepared("tx-crash-1", [
    {
      collectionName: "accounts",
      type: "insert",
      doc: { _id: "acc-1", balance: 500 },
    },
  ]);
  await txLog.close();

  const db = new FlashDatabase("recover_db", { storagePath: tmpDir });
  const result = await db.recoverTransactions({ replay: true });
  assert.equal(result.pending, 1);
  assert.equal(result.recovered[0].status, "replayed");

  const col = db.collection("accounts");
  await col.init();
  const doc = await col.findOne({ _id: "acc-1" });
  assert.equal(doc.balance, 500);

  await db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("BSON codec round-trip", () => {
  const doc = { ok: 1, name: "FLASH", count: 42, active: true, meta: { v: 2 } };
  const encoded = FlashBSON.encode(doc);
  const { value } = FlashBSON.decode(encoded);
  assert.deepEqual(value, doc);
});
