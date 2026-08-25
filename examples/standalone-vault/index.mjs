/**
 * FLASH as a standalone encrypted vault — not a companion to another database.
 *
 * Run: node examples/standalone-vault/index.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FlashClient } from "../../src/client/flash_client.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flash-standalone-vault-"));
// Demo-only inline key. Apps: flashsh wrap-key → new FlashClient({ storagePath })
const flash = new FlashClient({
  secretKey: "device-only-key-never-leaves-this-process",
  storagePath: tmp,
  engineOptions: { durability: "strict" },
});

const drafts = flash.collection("drafts");
const { insertedId } = await drafts.insertOne({
  title: "Private draft",
  secret: "passport-number-local-only",
  published: false,
});

const draft = await drafts.findOne({ _id: insertedId });
const raw = await flash.db.collection("drafts").findOne({ _id: insertedId });

console.log("FLASH client (decrypted locally):", {
  _id: draft._id,
  title: draft.title,
  hasSecret: Boolean(draft.secret),
});
console.log("FLASH engine (sealed on disk):", {
  sealed: Buffer.isBuffer(raw),
  containsPlaintext: Buffer.isBuffer(raw)
    ? raw.includes(Buffer.from("passport-number-local-only"))
    : null,
});

await flash.close();
fs.rmSync(tmp, { recursive: true, force: true });
