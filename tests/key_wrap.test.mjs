import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FlashClient,
  writeWrappedKeyFiles,
  resolveWrappedSecretKey,
  sealSecretKey,
  unsealSecretKey,
  generateFlashSecret,
  FLASH_WRAP_FILENAME,
  FLASH_TAKE_FILENAME,
} from "../src/index.mjs";

describe("key wrap (.flash-wrap / .flash-take)", () => {
  /** @type {string} */
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-wrap-"));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("generates passphrase-shaped secrets", () => {
    const a = generateFlashSecret("flash_wrap");
    const b = generateFlashSecret("flash_wrap");
    assert.match(a, /^flash_wrap_/);
    assert.notEqual(a, b);
    assert.ok(a.length >= 40);
  });

  it("seals and unseals a master key", () => {
    const secret = generateFlashSecret("flash_master");
    const wrap = generateFlashSecret("flash_wrap");
    const body = sealSecretKey(secret, wrap);
    assert.match(body, /^FLASHTAKE1\n/);
    assert.equal(unsealSecretKey(body, wrap), secret);
  });

  it("writes .flash-wrap + .flash-take without exposing secrets in files wrongly", () => {
    const master = generateFlashSecret("flash_master");
    const { wrapPath, takePath } = writeWrappedKeyFiles({
      dir,
      secretKey: master,
      force: true,
    });
    assert.equal(path.basename(wrapPath), FLASH_WRAP_FILENAME);
    assert.equal(path.basename(takePath), FLASH_TAKE_FILENAME);
    const wrap = fs.readFileSync(wrapPath, "utf8").trim();
    const take = fs.readFileSync(takePath, "utf8");
    assert.notEqual(wrap, master);
    assert.ok(!take.includes(master));
    assert.equal(resolveWrappedSecretKey(dir), master);
  });

  it("FlashClient opens with wrap files and no secretKey option", async () => {
    const master = generateFlashSecret("flash_master");
    writeWrappedKeyFiles({ dir, secretKey: master, force: true });
    const client = new FlashClient({
      wrapKeyDir: dir,
      storagePath: path.join(dir, "data"),
      inMemory: true,
    });
    const col = client.collection("wrap_demo");
    await col.insertOne({ ok: true });
    const rows = await col.find({ ok: true });
    assert.equal(rows.length, 1);
    await client.close();
  });
});
