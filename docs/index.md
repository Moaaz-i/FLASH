---
layout: home

hero:
  name: "FLASH DB"
  text: "Zero-Knowledge Encrypted Intelligence"
  tagline: "Server-blind by architecture. Local-first. AI-native. Architectural zero-knowledge — not a zk-SNARK suite. See the trust model."
  image:
    src: /logo.svg
    alt: FLASH DB
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What's New in 1.2.0
      link: /guide/whats-new
    - theme: alt
      text: Trust Model
      link: /guide/trust-model

features:
  - icon: 🔐
    title: Fail-Closed by Default (1.2.0)
    details: Daemons require authKey. The console requires a token. Weak secrets and accidental plaintext fields are rejected. Public bind is opt-in.
  - icon: 🧱
    title: Universal Foundations
    details: Cross-domain primitives — eventLog, counter, queue, lifecycle, pagination, health, snapshot — one API for apps, chat, games, AI, and jobs.
  - icon: 🧠
    title: AI-Native Intelligence Layer
    details: HNSW vector search, semantic cache, RAG context optimizer, NL query compiler, and LLM tool-calling — storage and AI in one engine.
  - icon: 🛡️
    title: Server-Blind Architecture
    details: Encryption is the foundation — not a feature flag. The engine stores ciphertext, trapdoors, and ORE tokens. Limits and leakage are documented in the trust model.
  - icon: 🔍
    title: Searchable Blind Indexing
    details: Exact matching ($eq, $in), partial text ($regex), and bucketed range queries ($gt, $lt) with honey padding — SSE still leaks patterns; design accordingly.
  - icon: 🔗
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
    title: Tamper-Evident Merkle Roots
    details: Cryptographic verification proofs to detect unauthorized modifications or disk injections within the Merkle threat model.
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
    title: Trust & Compliance Tools
    details: Integrity proofs, GDPR export/erase helpers, prompt firewall, key ceremony — tools, not a compliance certificate. Audit roadmap published.
---

<div class="flash-doc-home">

## Quick Example

```javascript
import { FlashClient } from "flash-zk";

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

const { insertedId } = await users.insertOne({
  name: "Ada Lovelace",
  email: "ada@computing-pioneer.org",
  role: "Mathematician",
  balance: 45000,
  status: "active",
});

const results = await users
  .find({ email: "ada@computing-pioneer.org" })
  .sort({ balance: -1 })
  .limit(10);

console.log(results[0].name); // 'Ada Lovelace'
```

</div>
