import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  FlashClient,
  FlashEmbeddingVault,
  FlashPortableBundle,
  FlashLangChainAdapter,
  FlashFederatedQuery,
  FlashDifferentialPrivacy,
  FlashPromptFirewall,
  FlashMultiAgentSync,
  FlashComplianceExport,
  FlashKeyCeremony,
  FlashTimeSeal,
  FlashBrowserVault,
  FlashEncryptedCRDT,
} from "../src/index.mjs";

test("Superpower: EmbeddingVault stores vectors only", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-emb-vault-"));
  try {
    const client = new FlashClient({ secretKey: "emb_vault_key", storagePath: tmpDir });
    const vault = client.embeddingVault("vectors");
    await vault.ingest("Secret knowledge about quantum encryption", { title: "Q" });

    const raw = await client.collection("vectors").find({}).exec();
    assert.ok(raw[0].contentHash);
    assert.equal(raw[0].content, undefined);

    const answer = await vault.ask("quantum encryption");
    assert.ok(answer.contextPack.length > 0);
    assert.equal(answer.serverSawPlaintext, false);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Superpower: PortableBundle export/import", async () => {
  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "flash-pack-a-"));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "flash-pack-b-"));
  const bundleFile = path.join(tmpA, "data.flashpack");
  try {
    const clientA = new FlashClient({ secretKey: "pack_key_shared", storagePath: tmpA });
    await clientA.collection("docs").insertOne({ title: "Portable", v: 1 });

    const pack = clientA.portableBundle();
    await pack.exportToFile(["docs"], bundleFile, { note: "test" });

    const clientB = new FlashClient({ secretKey: "pack_key_shared", storagePath: tmpB });
    const manifest = await FlashPortableBundle.importFromFile(bundleFile, clientB);
    assert.equal(manifest.engine, "FLASH");

    const docs = await clientB.collection("docs").find({}).exec();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].title, "Portable");
    await clientA.close();
    await clientB.close();
  } finally {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  }
});

test("Superpower: LangChain adapter vector store + memory", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-lc-"));
  try {
    const client = new FlashClient({ secretKey: "lc_key", storagePath: tmpDir });
    const lc = client.langChainAdapter();
    const vs = lc.asVectorStore();
    await vs.addDocuments([
      { pageContent: "FLASH is server-blind encrypted intelligence storage", metadata: { title: "FLASH" } },
    ]);
    const hits = await vs.similaritySearch("server blind encryption", 2);
    assert.ok(hits.length >= 1);

    const mem = lc.asMemory();
    await mem.saveContext("What is FLASH?", "Encrypted intelligence database.");
    const vars = await mem.loadMemoryVariables({ input: "FLASH" });
    assert.ok(vars.history.length > 0);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Superpower: FederatedQuery merges peers", async () => {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), "flash-fed-1-"));
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "flash-fed-2-"));
  try {
    const c1 = new FlashClient({ secretKey: "fed_key", storagePath: tmp1, dbName: "n1" });
    const c2 = new FlashClient({ secretKey: "fed_key", storagePath: tmp2, dbName: "n2" });
    await c1.collection("items").insertOne({ region: "eu", v: 1 });
    await c2.collection("items").insertOne({ region: "us", v: 2 });

    const fed = new FlashFederatedQuery();
    fed.addPeer("eu", c1).addPeer("us", c2);
    const all = await fed.find("items", {});
    assert.equal(all.length, 2);
    await c1.close();
    await c2.close();
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

test("Superpower: DifferentialPrivacy noisy aggregates", () => {
  const noisy = FlashDifferentialPrivacy.noisyCount(100, 0.5);
  assert.ok(noisy >= 0);
  const sum = FlashDifferentialPrivacy.noisySum(1000, 10, 1.0);
  assert.ok(typeof sum === "number");
});

test("Superpower: PromptFirewall redacts PII", () => {
  const scan = FlashPromptFirewall.scan("Contact me at test@email.com or sk-123456789012345678901234");
  assert.equal(scan.safe, false);
  assert.ok(scan.violations.includes("email"));
  assert.match(scan.redacted, /REDACTED/);
});

test("Superpower: MultiAgentSync shared memory", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-mas-"));
  try {
    const client = new FlashClient({ secretKey: "mas_key", storagePath: tmpDir });
    const sync = client.multiAgentSync("team");
    sync.registerAgent("researcher");
    sync.registerAgent("writer");
    await sync.share("researcher", "Found evidence for hypothesis A");
    const ctx = await sync.getSharedContext("hypothesis");
    assert.ok(ctx.memories.length >= 1);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Superpower: ComplianceExport GDPR erase attestation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-gdpr-"));
  try {
    const client = new FlashClient({ secretKey: "gdpr_key", storagePath: tmpDir });
    await client.collection("users").insertOne({ email: "a@test.com", name: "A" });
    const compliance = client.complianceExport();
    const att = await compliance.eraseSubjectData("users", { email: "a@test.com" }, "dpo");
    assert.equal(att.deletedCount, 1);
    assert.ok(att.signature);
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Superpower: KeyCeremony split/combine", () => {
  const ceremony = new FlashKeyCeremony(3);
  const master = "a".repeat(64);
  const shards = ceremony.split(master);
  assert.equal(shards.length, 3);
  const restored = ceremony.combine(shards);
  assert.equal(restored, master);
});

test("Superpower: TimeSeal tamper-evident chain", () => {
  const sealPath = path.join(os.tmpdir(), `flash-seal-${Date.now()}.json`);
  const seal = new FlashTimeSeal(sealPath, "seal_secret");
  seal.seal("document.ingest", { docId: "1" });
  seal.seal("document.query", { q: "test" });
  const v = seal.verify();
  assert.equal(v.valid, true);
  fs.unlinkSync(sealPath);
});

test("Superpower: BrowserVault encrypted local store", async () => {
  const vault = new FlashBrowserVault("browser_secret_key_2026");
  await vault.put("prefs", { theme: "dark", lang: "ar" });
  const val = await vault.get("prefs");
  assert.equal(val.lang, "ar");
});

test("Superpower: EncryptedCRDT merge", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flash-crdt-"));
  try {
    const client = new FlashClient({ secretKey: "crdt_key", storagePath: tmp });
    const nodeA = client.encryptedCRDT("notes", "node-a");
    const nodeB = client.encryptedCRDT("notes", "node-b");

    const entry = await nodeA.localWrite({ _id: "1", text: "hello" });
    await nodeB.applyRemoteDelta(entry);

    const docs = await client.collection("notes").find({}).exec();
    assert.equal(docs.length, 1);
    await client.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
