#!/usr/bin/env node
/**
 * FLASH Example: Agent Memory Bot
 * Encrypted episodic memory with semantic recall.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../../src/index.mjs";

const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "flash-mem-ex-"));

const client = new FlashClient({
  secretKey: "example_memory_key_32_chars_min!",
  storagePath,
});

try {
  console.log("⚡ FLASH Agent Memory Example\n");

  const memory = client.agentMemory("demo_bot");

  await memory.remember("User name is Moaaz", { importance: 2, tags: ["profile"] });
  await memory.remember("User prefers Arabic for explanations", {
    importance: 2.5,
    tags: ["preference"],
  });
  await memory.remember("User is building a private AI app with FLASH", {
    importance: 1.5,
    tags: ["project"],
  });

  console.log("✓ Stored 3 encrypted memories\n");

  const recalled = await memory.recall("What language does the user like?", {
    topK: 3,
  });

  console.log("Semantic recall for: What language does the user like?\n");
  for (const item of recalled) {
    console.log(`  • ${item.content} (score: ${item.score?.toFixed(3) ?? "—"})`);
  }
} finally {
  await client.close();
  fs.rmSync(storagePath, { recursive: true, force: true });
}
