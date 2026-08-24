import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

import {
  FlashClient,
  FlashDatabase,
  FlashGraphQL,
  FlashRBAC,
  FlashSQL,
  FlashServer,
  FlashZKKernel,
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

test("ZK kernel: engine buffers never contain plaintext", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-zk-plain-"));
  const secret = "UNIQUE-PLAINTEXT-TOKEN-ZK-TEST";
  const client = new FlashClient({
    secretKey: "zk_engine_blind_key_32_chars!!",
    storagePath: tmpDir,
    autoTimestamps: false,
  });
  try {
    await client.collection("notes").insertOne({ _id: "n1", body: secret });
    const raw = await client.db.collection("notes").findOne({ _id: "n1" });
    assert.ok(Buffer.isBuffer(raw));
    assert.equal(FlashZKKernel.bufferContainsUtf8(raw, secret), false);
    const doc = await client.collection("notes").findOne({ _id: "n1" });
    assert.equal(doc.body, secret);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ZK kernel: FlashSQL and FlashGraphQL require FlashClient", async () => {
  const db = new FlashDatabase("zk_reject", { inMemory: true });
  await assert.rejects(
    () => FlashSQL.execute(db, "SELECT * FROM notes"),
    /requires FlashClient/,
  );
  assert.throws(() => new FlashGraphQL(db), /requires FlashClient/);
});

test("ZK kernel: FlashServer rejects plaintext inserts and queries", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-zk-server-"));
  const port = await getFreePort();
  const authKey = "zk_server_auth_token_2026";
  const server = FlashServer.start({
    port,
    host: "127.0.0.1",
    storagePath: tmpDir,
    authKey,
  });
  await new Promise((r) => setTimeout(r, 40));
  const headers = {
    "Content-Type": "application/json",
    "x-flash-server-key": authKey,
  };
  try {
    const insertRes = await fetch(
      `http://127.0.0.1:${port}/api/v1/insert/notes`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          encryptedRecord: { _id: "p1", body: "this-is-plaintext" },
        }),
      },
    );
    assert.equal(insertRes.status, 400);
    const insertBody = await insertRes.json();
    assert.match(insertBody.error, /Zero-knowledge violation/);

    const queryRes = await fetch(
      `http://127.0.0.1:${port}/api/v1/query/notes`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ envelope: { body: "this-is-plaintext" } }),
      },
    );
    assert.equal(queryRes.status, 400);
    const queryBody = await queryRes.json();
    assert.match(queryBody.error, /Zero-knowledge violation/);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ZK kernel: FlashServer RBAC is enforced", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-zk-rbac-"));
  const port = await getFreePort();
  const rbac = new FlashRBAC();
  rbac.assignRole("alice", "admin");
  const server = FlashServer.start({
    port,
    host: "127.0.0.1",
    storagePath: tmpDir,
    rbac,
    authKey: "zk_rbac_auth_key_16",
  });
  await new Promise((r) => setTimeout(r, 40));
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/v1/insert/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-flash-server-key": "zk_rbac_auth_key_16",
      },
      body: JSON.stringify({ encryptedRecord: { _id: "x" } }),
    });
    assert.equal(denied.status, 403);

    const stillDenied = await fetch(
      `http://127.0.0.1:${port}/api/v1/insert/notes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-flash-server-key": "zk_rbac_auth_key_16",
          "x-flash-user": "bob",
        },
        body: JSON.stringify({ encryptedRecord: { _id: "x" } }),
      },
    );
    assert.equal(stillDenied.status, 403);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trust defaults: FlashServer requires authKey", () => {
  assert.throws(
    () => FlashServer.start({ host: "127.0.0.1" }),
    /requires authKey/,
  );
});

test("trust defaults: plaintext fieldPolicy is opt-in", () => {
  assert.throws(
    () =>
      new FlashClient({
        secretKey: "trust_default_key_16",
        inMemory: true,
        fieldPolicy: { email: "plaintext" },
      }),
    /allowPlaintextFields/,
  );
});

test("trust defaults: weak secrets are rejected", () => {
  assert.throws(
    () => new FlashClient({ secretKey: "password", inMemory: true }),
    /too weak|at least/,
  );
});
