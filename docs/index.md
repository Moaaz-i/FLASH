---
layout: home

hero:
  name: "FLASH DB"
  text: "Zero-Knowledge Encrypted Intelligence Database"
  tagline: "Server-blind by architecture. Local-first. AI-native. Private RAG, agent memory, and sealed vaults — encrypted end-to-end."
  image:
    src: /logo.svg
    alt: FLASH DB
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Why FLASH?
      link: /guide/positioning
    - theme: alt
      text: Universal Foundations
      link: /guide/foundations
    - theme: alt
      text: View Architecture
      link: /guide/architecture
    - theme: alt
      text: Benchmarks
      link: /api/benchmarks

features:
  - icon: 🧱
    title: Universal Foundations
    details: Cross-domain primitives — eventLog, counter, queue, lifecycle, pagination, health, snapshot — one API for apps, chat, games, AI, and jobs.
  - icon: 🧠
    title: AI-Native Intelligence Layer
    details: HNSW vector search, semantic cache, RAG context optimizer, NL query compiler, and LLM tool-calling — storage and AI in one engine.
  - icon: 🛡️
    title: Server-Blind Architecture
    details: Encryption is the foundation — not a feature flag. The engine stores ciphertext, trapdoors, and ORE tokens. Plaintext never touches disk or server RAM.
  - icon: 🔍
    title: Searchable Blind Indexing
    details: Supports exact matching ($eq, $in), partial text ($regex), and bucketed range queries ($gt, $lt) with honey padding frequency defense.
  - icon: 🔐
    title: AAD Field Binding (Anti-Swap)
    details: Each ciphertext is cryptographically bound to its record ID and field name, preventing ciphertext swapping attacks between documents.
  - icon: 🧮
    title: Homomorphic Arithmetic
    details: Compute sums and aggregations ($sum, $inc) directly over encrypted numerical fields without server-side decryption.
  - icon: 💾
    title: Balanced Durability Engine
    details: Configurable strict / balanced / throughput modes. Default balanced batches fsync (64 ops / 25 ms) with full sync on close. Atomic SSTable writes.
  - icon: 📊
    title: Structured Logging
    details: JSON structured logger with level filtering, sensitive key redaction, and integration with ELK, Datadog, Grafana Loki, and CloudWatch.
  - icon: 🌲
    title: Tamper-Proof Merkle Roots
    details: Instant cryptographic verification proofs. Detect any unauthorized modifications or disk injections immediately.
  - icon: 🏗️
    title: Modern LSM-Tree Engine
    details: Lock-Free SkipList MemTable + Append-Only WAL + Bloom Filtered Compressed SSTable segments with atomic writes.
  - icon: 🔒
    title: Private RAG & Agent Memory
    details: Encrypted ingest, semantic ask, agent episodic memory, LangChain adapter — intelligence without server plaintext.
  - icon: 📦
    title: Portable & Federated
    details: "flashpack bundles, cloud sync, federated multi-peer queries, and encrypted CRDT for sovereign data mobility."
  - icon: ⚖️
    title: Trust & Compliance
    details: Integrity proofs, GDPR export/erase, prompt firewall, key ceremony, time seal, and differential privacy.
---

## Quick Example

```javascript
import { FlashClient } from "flash-db";

// 1. Initialize Client with Master Secret Key
const client = new FlashClient({
  secretKey: "quantum_production_passphrase_2026",
  storagePath: "./data",
});

const users = client.collection("users", {
  schema: {
    name: { type: "string", required: true, trim: true },
    email: { type: "string", required: true, unique: true },
    balance: { type: "number", default: 0 },
  },
});

// 2. Insert Document (Encrypted on Client Side with AAD binding)
const { insertedId } = await users.insertOne({
  name: "Ada Lovelace",
  email: "ada@computing-pioneer.org",
  role: "Mathematician",
  balance: 45000,
  status: "active",
});

// 3. Search Over Encrypted Blind Indexes (Server remains 100% blind)
const results = await users
  .find({ email: "ada@computing-pioneer.org" })
  .sort({ balance: -1 })
  .limit(10);

console.log(results[0].name); // 'Ada Lovelace'

// 4. Natural Language Query (AI Engine)
const nlResults = await users.ask("show me users with balance over 30000", {
  limit: 5,
});

// 5. Backup & Restore
await client.backup("/backups/flash-daily");
```
