import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../src/client/flash_client.mjs";
import { FlashRecordCodec } from "../src/client/record_codec.mjs";
import { FlashDatabase } from "../src/core/database.mjs";

const SAMPLE = {
  title: "FLASH compact storage benchmark document",
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8),
  tags: ["db", "encrypted", "compact"],
  views: 42,
};

test("compact storageProfile is much smaller than standard searchable", async () => {
  const standard = new FlashClient({
    secretKey: "storage_size_test_key_32b!",
    fieldPolicy: { title: "searchable", body: "searchable", tags: "searchable", views: "searchable" },
    storageProfile: "standard",
  });

  const compact = new FlashClient({
    secretKey: "storage_size_test_key_32b!",
    storageProfile: "compact",
    fieldPolicy: {
      title: "exact",
      body: "encrypted",
      tags: "plaintext",
      views: "exact",
    },
    allowPlaintextFields: true,
    engineOptions: { compressionLevel: 6 },
  });

  const stdBuf = standard.encryptToBuffer({ ...SAMPLE, _id: "size-1" });
  const cmpBuf = compact.encryptToBuffer({ ...SAMPLE, _id: "size-1" });

  assert.ok(
    cmpBuf.length < stdBuf.length * 0.35,
    `compact (${cmpBuf.length}B) should be <35% of standard (${stdBuf.length}B)`,
  );

  const roundTrip = compact.decryptFromBuffer(cmpBuf);
  assert.strictEqual(roundTrip.title, SAMPLE.title);
  assert.strictEqual(roundTrip.body, SAMPLE.body);
  assert.deepStrictEqual(roundTrip.tags, SAMPLE.tags);
  assert.strictEqual(roundTrip.views, SAMPLE.views);
});

test("encrypted field policy skips blind index", () => {
  const client = new FlashClient({
    secretKey: "storage_size_test_key_32b!",
    storageProfile: "compact",
    fieldPolicy: { secret: "encrypted" },
  });

  const record = client.encryptDocument({ _id: "x", secret: "top secret" });
  assert.ok(!record._blind, "encrypted-only fields must omit _blind");
  assert.ok(Buffer.isBuffer(record._enc.secret));
});

test("compact persists and queries with exact match", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-compact-"));

  try {
    const client = new FlashClient({
      secretKey: "storage_size_test_key_32b!",
      storagePath: tmpDir,
      storageProfile: "compact",
      fieldPolicy: { email: "exact", note: "encrypted" },
      engineOptions: { compressionLevel: 6 },
    });

    const col = client.collection("users");
    await col.insertOne({
      email: "ada@math.io",
      note: "private note",
    });

    const found = await col.find({ email: "ada@math.io" }).exec();
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].email, "ada@math.io");
    assert.strictEqual(found[0].note, "private note");

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FlashRecordCodec reads compact buffers written by another client instance", () => {
  const writer = new FlashClient({
    secretKey: "storage_size_test_key_32b!",
    storageProfile: "compact",
  });
  const reader = new FlashClient({
    secretKey: "storage_size_test_key_32b!",
    storageProfile: "standard",
  });

  const buf = writer.encryptToBuffer({ _id: "r1", name: "Grace" });
  const doc = FlashRecordCodec.decrypt(reader, buf);
  assert.strictEqual(doc.name, "Grace");
});
