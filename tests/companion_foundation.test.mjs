import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashDatabase } from "../src/core/database.mjs";
import { FlashServer } from "../src/server/flash_server.mjs";

test("FlashClient throws if deletionLog is on the client root", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_misplaced_del_log!",
        deletionLog: { enabled: true },
      }),
    /deletionLog must be engineOptions\.deletionLog/,
  );
});

test("FlashClient throws if trash is on the client root", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_misplaced_trash!!",
        trash: { enabled: false },
      }),
    /trash must be engineOptions\.trash/,
  );
});

test("FlashClient throws if an unknown root option is planted", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_unknown_root_opt!!",
        enabled: true,
      }),
    /unknown FlashClient option: enabled/,
  );
});

test("FlashClient throws if deletionLog is nested inside trash", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_trash_nested_del!!!!",
        engineOptions: {
          trash: { deletionLog: { enabled: true } },
        },
      }),
    /trash\.deletionLog/,
  );
});

test("FlashClient throws if durability is not a known mode", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_bad_durability!!!!!",
        engineOptions: { durability: "strong" },
      }),
    /engineOptions\.durability is invalid/,
  );
});

test("FlashClient throws if deletionLog is a boolean instead of an object", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_del_log_boolean!!!",
        engineOptions: { deletionLog: true },
      }),
    /engineOptions\.deletionLog must be an object/,
  );
});

test("FlashClient throws if uri is a MongoDB connection string", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "foundation_mongo_uri_reject!!",
        uri: "mongodb://localhost:27017/app",
      }),
    /not a MongoDB connection string/,
  );
});

test("FlashDatabase throws on unknown options and misplaced deletionLog", () => {
  assert.throws(
    () => new FlashDatabase("vault", { enabled: true }),
    /unknown FlashDatabase option: enabled/,
  );
  assert.throws(
    () =>
      new FlashDatabase("vault", {
        engineOptions: { trash: { deletionLog: { enabled: true } } },
      }),
    /trash\.deletionLog/,
  );
});

test("FlashServer throws on unknown options", () => {
  assert.throws(
    () => new FlashServer({ deletionLog: { enabled: true } }),
    /unknown FlashServer option: deletionLog/,
  );
});

test("listDeletions and listTrash throw when the feature is disabled", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-foundation-off-"));
  try {
    const client = new FlashClient({
      secretKey: "foundation_features_off_key!!",
      storagePath: tmpDir,
      engineOptions: {
        trash: { enabled: false },
      },
    });
    const col = client.collection("notes");
    await assert.rejects(
      () => client.listDeletions(),
      /engineOptions\.deletionLog is disabled/,
    );
    await assert.rejects(
      () => col.listTrash(),
      /engineOptions\.trash is disabled/,
    );
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashClient accepts deletionLog and trash under engineOptions", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-foundation-ok-"));
  try {
    const client = new FlashClient({
      secretKey: "foundation_engine_opts_ok!!!!",
      storagePath: tmpDir,
      engineOptions: {
        deletionLog: { enabled: true },
        trash: { enabled: true },
      },
    });
    assert.ok(client.db.deletionLog);
    assert.ok(client.db.trashVault);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashClient - documents survive close and reopen with the same key", async () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "flash-foundation-reopen-"),
  );
  const secretKey = "foundation_reopen_same_key_32!";
  try {
    const writer = new FlashClient({
      secretKey,
      dbName: "vault",
      storagePath: tmpDir,
      engineOptions: { durability: "strict" },
    });
    const { insertedId } = await writer.collection("notes").insertOne({
      _id: "n1",
      body: "local draft stays here",
    });
    await writer.close();

    const reader = new FlashClient({
      secretKey,
      dbName: "vault",
      storagePath: tmpDir,
    });
    const doc = await reader.collection("notes").findOne({ _id: insertedId });
    assert.equal(doc.body, "local draft stays here");
    await reader.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashClient - wrong secretKey must not return plaintext", async () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "flash-foundation-wrongkey-"),
  );
  const secret = "correct-foundation-secret-key!!";
  try {
    const writer = new FlashClient({
      secretKey: secret,
      dbName: "vault",
      storagePath: tmpDir,
      engineOptions: { durability: "strict" },
    });
    await writer.collection("notes").insertOne({
      _id: "secret-1",
      body: "NEVER-LEAK-THIS-PLAINTEXT",
    });
    await writer.close();

    const attacker = new FlashClient({
      secretKey: "wrong-foundation-secret-key!!!",
      dbName: "vault",
      storagePath: tmpDir,
    });

    let leaked = null;
    try {
      leaked = await attacker.collection("notes").findOne({ _id: "secret-1" });
    } catch {
      leaked = null;
    }
    await attacker.close();

    const text = JSON.stringify(leaked);
    assert.equal(
      text.includes("NEVER-LEAK-THIS-PLAINTEXT"),
      false,
      "wrong key must not decrypt document fields",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
