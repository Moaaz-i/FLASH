import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashDeletionLog } from "../src/engine/deletion_log.mjs";

test("FlashDeletionLog is disabled by default", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-del-log-off-"));

  try {
    const client = new FlashClient({
      secretKey: "deletion_log_off_secret!",
      storagePath: tmpDir,
    });

    assert.equal(client.db.deletionLog, null);

    const col = client.collection("notes");
    await col.insertOne({ _id: "n1", title: "x" });
    await col.deleteOne({ _id: "n1" });

    const entries = await client.listDeletions();
    assert.deepEqual(entries, []);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashDeletionLog records delete and restore metadata", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-del-log-on-"));

  try {
    const client = new FlashClient({
      secretKey: "deletion_log_on_secret!!",
      storagePath: tmpDir,
      engineOptions: {
        deletionLog: { enabled: true },
        trash: { enabled: true, maxEntries: 50 },
      },
    });

    const col = client.collection("notes");
    await col.insertOne({ _id: "n1", title: "restore me" });
    await col.deleteOne({ _id: "n1" });

    const deletions = await col.listDeletions({ limit: 10 });
    assert.equal(deletions.length, 1);
    assert.equal(deletions[0].docId, "n1");
    assert.equal(deletions[0].action, "delete");
    assert.equal(deletions[0].restorable, true);

    await col.restoreOne("n1");

    const all = await client.listDeletions({ limit: 10 });
    assert.equal(all.length, 2);
    assert.equal(all[0].action, "restore");
    assert.equal(all[0].docId, "n1");

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashDeletionLog keeps all entries permanently (no auto eviction)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flash-del-log-perm-"));
  const logPath = path.join(tmp, ".flash-deletion-log");

  const log = new FlashDeletionLog(logPath, {
    enabled: true,
    logSecret: "test-deletion-log-secret-key!!",
  });

  for (let i = 1; i <= 5; i += 1) {
    await log.append({ collection: "c", docId: String(i), action: "delete" });
  }

  const rows = await log.list({ limit: 100 });
  assert.equal(rows.length, 5);
  assert.ok(rows.some((e) => e.docId === "1"));
  assert.ok(rows.some((e) => e.docId === "5"));

  await log.close();

  const reopened = new FlashDeletionLog(logPath, {
    enabled: true,
    logSecret: "test-deletion-log-secret-key!!",
  });
  await reopened.open();
  const persisted = await reopened.list({ limit: 100 });
  assert.equal(persisted.length, 5);

  await reopened.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("dropCollection appends drop_collection without removing prior log entries", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-del-log-drop-"));

  try {
    const client = new FlashClient({
      secretKey: "deletion_log_drop_secret!",
      storagePath: tmpDir,
      engineOptions: {
        deletionLog: { enabled: true },
      },
    });

    const col = client.collection("temp");
    await col.insertOne({ _id: "t1", v: 1 });
    await col.deleteOne({ _id: "t1" });

    await client.db.dropCollection("temp");

    const entries = await client.listDeletions({ limit: 100 });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "drop_collection");
    assert.equal(entries[0].collection, "temp");
    assert.equal(entries[1].action, "delete");
    assert.equal(entries[1].docId, "t1");

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("deletion log file on disk is sealed (no plaintext metadata)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-del-log-seal-"));

  try {
    const client = new FlashClient({
      secretKey: "deletion_log_sealed_secret!",
      storagePath: tmpDir,
      engineOptions: { deletionLog: { enabled: true } },
    });

    const col = client.collection("notes");
    await col.insertOne({ _id: "secret-id", title: "x" });
    await col.deleteOne({ _id: "secret-id" });
    await client.close();

    const logPath = path.join(tmpDir, "flash_db", ".flash-deletion-log");
    const raw = fs.readFileSync(logPath);
    assert.ok(raw.subarray(0, 4).equals(Buffer.from("FDEL")));
    assert.equal(raw.readUInt32LE(4), 2);
    assert.ok(!raw.includes(Buffer.from("secret-id")));
    assert.ok(!raw.includes(Buffer.from("notes")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
