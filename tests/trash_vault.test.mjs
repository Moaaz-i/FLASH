import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashTrashVault } from "../src/engine/trash_vault.mjs";

test("FlashTrashVault evicts oldest entries beyond maxEntries", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flash-trash-"));
  const vault = new FlashTrashVault(path.join(tmp, ".flash-trash"), {
    maxEntries: 2,
    maxBytes: 1024 * 1024,
    trashSecret: "test-trash-secret-key-32bytes!!",
  });

  await vault.archive({ collection: "c", docId: "1", doc: { _id: "1", v: 1 } });
  await vault.archive({ collection: "c", docId: "2", doc: { _id: "2", v: 2 } });
  await vault.archive({ collection: "c", docId: "3", doc: { _id: "3", v: 3 } });

  const list = await vault.list();
  assert.equal(list.length, 2);
  assert.ok(!list.some((e) => e.docId === "1"));
  assert.ok(list.some((e) => e.docId === "3"));

  await vault.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("FlashClientCollection archives delete and restoreOne works", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-trash-client-"));

  try {
    const client = new FlashClient({
      secretKey: "trash_restore_test_secret!",
      storagePath: tmpDir,
      engineOptions: {
        trash: { maxEntries: 10 },
      },
    });

    const col = client.collection("notes");
    await col.insertOne({ _id: "n1", title: "keep me later", body: "secret" });

    const del = await col.deleteOne({ _id: "n1" });
    assert.equal(del.deletedCount, 1);

    const missing = await col.findOne({ _id: "n1" });
    assert.equal(missing, null);

    const trash = await col.listTrash();
    assert.equal(trash.length, 1);
    assert.equal(trash[0].docId, "n1");

    const restored = await col.restoreOne("n1");
    assert.equal(restored.restored, true);

    const again = await col.findOne({ _id: "n1" });
    assert.equal(again.title, "keep me later");
    assert.equal((await col.listTrash()).length, 0);

    await client.close();
    assert.ok(fs.existsSync(path.join(tmpDir, "flash_db", ".flash-trash")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("raw collection delete archives buffer into shared trash file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-trash-raw-"));

  try {
    const client = new FlashClient({
      secretKey: "trash_raw_delete_secret!!",
      storagePath: tmpDir,
    });
    const col = client.collection("items");
    await col.insertOne({ _id: "r1", sku: "ABC" });
    await col.raw.deleteOne({ _id: "r1" });

    const trash = await client.db.trashVault.list({ collection: "items" });
    assert.equal(trash.length, 1);
    assert.equal(trash[0].docId, "r1");

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("dropCollection purges trash entries for that collection", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-trash-drop-"));

  try {
    const client = new FlashClient({
      secretKey: "trash_drop_collection_secret!",
      storagePath: tmpDir,
    });

    const users = client.collection("users");
    const orders = client.collection("orders");

    await users.insertOne({ _id: "u1", name: "Ada" });
    await orders.insertOne({ _id: "o1", total: 99 });

    await users.deleteOne({ _id: "u1" });
    await orders.deleteOne({ _id: "o1" });

    assert.equal((await users.listTrash()).length, 1);
    assert.equal((await orders.listTrash()).length, 1);

    await client.db.dropCollection("users");

    assert.equal((await users.listTrash()).length, 0);
    assert.equal((await orders.listTrash()).length, 1);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
