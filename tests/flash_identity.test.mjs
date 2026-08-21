import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  FlashClient,
  FlashPrivateRAG,
  FlashAgentMemory,
  FlashSealedVault,
  FlashIntegrityProof,
} from "../src/index.mjs";

async function withClient(tmpDir, fn) {
  const client = new FlashClient({
    secretKey: "identity_test_key_32_chars!!",
    storagePath: tmpDir,
  });
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("FLASH identity: Private RAG — encrypted ingest and semantic ask", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-rag-"));

  try {
    await withClient(tmpDir, async (client) => {
      const rag = client.privateRAG("knowledge");

      await rag.ingest({
        title: "FLASH Security",
        text: "FLASH stores all documents encrypted client-side. The server matches blind trapdoors only. Vector search runs on encrypted embeddings for private RAG pipelines.",
      });

      await rag.ingest({
        title: "Unrelated",
        text: "Weather forecast shows rain tomorrow in coastal cities.",
      });

      const answer = await rag.ask("How does private RAG work with encryption?", {
        topK: 4,
        maxTokens: 800,
      });

      assert.ok(answer.contextPack.length > 0);
      assert.equal(answer.serverSawPlaintext, false);
      assert.ok(answer.sources.length >= 1);
      assert.match(answer.contextPack.toLowerCase(), /encrypt|blind|vector/);

      const bundle = await rag.exportBundle("blind trapdoors");
      assert.equal(bundle.type, "private_rag_bundle");
      assert.equal(bundle.engine, "FLASH");
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH identity: Agent Memory — remember, recall, expire", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-memory-"));

  try {
    await withClient(tmpDir, async (client) => {
      const memory = client.agentMemory("assistant");

      await memory.remember("User prefers dark mode and Arabic UI", {
        tags: ["preference"],
        importance: 2,
      });
      await memory.remember("Project deadline is March 15", {
        tags: ["deadline"],
        importance: 3,
      });
      await memory.remember("Temporary cache entry", {
        ttlMs: 1,
      });

      await new Promise((r) => setTimeout(r, 5));
      await memory.pruneExpired();

      const recalled = await memory.recall(
        "What UI language does the user want?",
      );
      assert.ok(recalled.length >= 1);
      assert.match(recalled[0].content.toLowerCase(), /arabic|dark/);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH identity: Sealed Vault — lock/unlock isolation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-vault-"));

  try {
    await withClient(tmpDir, async (client) => {
      const vault = client.sealedVault("credentials");

      await assert.rejects(
        () => vault.put("api_key", { value: "secret" }),
        /locked/,
      );

      vault.unlock("my-vault-passphrase");
      await vault.put("api_key", { service: "openai", value: "sk-test" });

      const record = await vault.get("api_key");
      assert.equal(record.service, "openai");

      vault.lock();
      await assert.rejects(() => vault.get("api_key"), /locked/);

      await vault.close();
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FLASH identity: Integrity Proof — signed merkle manifest", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-proof-"));

  try {
    await withClient(tmpDir, async (client) => {
      const notes = client.collection("notes");
      await notes.insertOne({ title: "Audit entry", body: "Compliance check" });

      const proof = await client.integrityProof("notes", { actor: "auditor" });
      assert.equal(proof.engine, "FLASH");
      assert.equal(proof.invariants.valid, true);
      assert.ok(proof.merkleRoot);
      assert.ok(FlashIntegrityProof.verify(proof, client.secretKey));
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
