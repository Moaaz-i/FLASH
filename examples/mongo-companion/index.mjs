/**
 * FLASH beside MongoDB — companion contract, not a replacement.
 *
 * FLASH keeps plaintext that must never leave the machine.
 * MongoDB (here: an in-memory stand-in) keeps only what the server may see.
 *
 * Run: node examples/mongo-companion/index.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FlashClient } from "../../src/client/flash_client.mjs";

const mongo = new Map();

function mongoUpsert(doc) {
  if ("secret" in doc) {
    throw new Error("Companion contract violated: secretKey/plaintext secret must not reach MongoDB");
  }
  mongo.set(doc.flashDocId, doc);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flash-mongo-companion-"));
const flash = new FlashClient({
  secretKey: "device-only-key-never-sent",
  storagePath: tmp,
  engineOptions: { durability: "strict" },
});

const local = flash.collection("drafts");
const { insertedId } = await local.insertOne({
  title: "Private draft",
  secret: "passport-number-local-only",
  published: false,
});

const draft = await local.findOne({ _id: insertedId });

mongoUpsert({
  flashDocId: draft._id,
  rev: 1,
  updatedAt: draft.updatedAt,
  title: draft.title,
  published: draft.published,
});

console.log("FLASH (local, encrypted):", {
  _id: draft._id,
  title: draft.title,
  hasSecret: Boolean(draft.secret),
});
console.log("MongoDB (shared, no secret):", mongo.get(draft._id));

await flash.close();
fs.rmSync(tmp, { recursive: true, force: true });
