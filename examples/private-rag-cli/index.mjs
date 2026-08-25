#!/usr/bin/env node
/**
 * FLASH Example: Private RAG CLI
 * Ingest knowledge → ask by semantic similarity (server-blind).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { FlashClient } from "../../src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "flash-rag-ex-"));

// Demo-only inline key. Apps: flashsh wrap-key → new FlashClient({ storagePath })
const client = new FlashClient({
  secretKey: "example_rag_key_32_chars_minimum!",
  storagePath,
});

const SAMPLE = `
FLASH is a zero-knowledge encrypted intelligence database.
The server never sees plaintext keys, queries, or document content.
Private RAG ingests documents client-side, chunks them, embeds vectors,
and retrieves by semantic similarity — all without exposing text to storage.
`;

try {
  console.log("⚡ FLASH Private RAG Example\n");

  const rag = client.privateRAG("knowledge");
  const ingested = await rag.ingest({
    title: "FLASH Overview",
    text: SAMPLE.trim(),
  });
  console.log(`✓ Ingested ${ingested.chunks} chunk(s)\n`);

  const q = "Does the server see my plaintext?";
  console.log(`Question: ${q}\n`);
  const answer = await rag.ask(q);

  if (answer.sources.length === 0) {
    console.log("(no matches)");
  } else {
    console.log("Top match:");
    console.log(answer.sources[0].text.slice(0, 200) + "...");
    console.log(`\n~${answer.tokens.used} tokens | server-blind: yes`);
  }
} finally {
  await client.close();
  fs.rmSync(storagePath, { recursive: true, force: true });
}
