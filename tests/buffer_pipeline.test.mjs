import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashRecordCodec } from "../src/client/record_codec.mjs";
import { FlashBinary } from "../src/binary/flash_binary.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flash-buf-"));
}

test("buffer pipeline: default insert/find uses buffers internally", async () => {
  const dir = tempDir();
  const client = new FlashClient({ secretKey: "buf-pipeline-key", storagePath: dir });
  const col = client.collection("items");

  await col.insertOne({ sku: "A1", qty: 10 });
  await col.insertOne({ sku: "B2", qty: 20 });

  const raw = await col.raw.find({}, { limit: 10 });
  assert.strictEqual(raw.length, 2);
  assert.ok(raw.every((r) => Buffer.isBuffer(r)));

  const docs = await col.find({}).exec();
  assert.strictEqual(docs.length, 2);
  assert.ok(docs.some((d) => d.sku === "A1"));
  assert.ok(docs.some((d) => d.sku === "B2"));

  await client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buffer pipeline: encryptToBuffer round-trip", async () => {
  const client = new FlashClient({ secretKey: "roundtrip-key", storagePath: tempDir() });
  const plain = { _id: "x1", name: "Flash", score: 99 };

  const buf = client.encryptToBuffer(plain);
  assert.ok(Buffer.isBuffer(buf));
  assert.strictEqual(FlashRecordCodec.extractId(buf), "x1");
  assert.ok(FlashBinary.getField(buf, "_blind") != null);

  const back = client.decryptFromBuffer(buf);
  assert.strictEqual(back.name, "Flash");
  assert.strictEqual(back.score, 99);
});

test("buffer pipeline: insertMany and update stay on buffer path", async () => {
  const dir = tempDir();
  const client = new FlashClient({ secretKey: "bulk-buf-key", storagePath: dir });
  const col = client.collection("bulk");

  await col.insertMany([
    { _id: "1", v: 1 },
    { _id: "2", v: 2 },
  ]);

  await col.updateOne({ _id: "1" }, { $set: { v: 100 } });

  const one = await col.findOne({ _id: "1" });
  assert.strictEqual(one.v, 100);

  const rawOne = await col.raw.findOne({ _id: "1" });
  assert.ok(Buffer.isBuffer(rawOne));

  await client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
