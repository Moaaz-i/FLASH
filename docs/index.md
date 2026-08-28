---
layout: home

hero:
  name: "FLASH DB"
  text: "Privacy first, while AI is created"
  tagline: "The first line of protection for private intelligence worldwide. Default flash-zk is strong. Keep the key. Do not weaken it."
  image:
    src: /logo.svg
    alt: FLASH DB
  actions:
    - theme: brand
      text: Mission
      link: /guide/mission
    - theme: alt
      text: Do this first
      link: /guide/do-this-first
    - theme: alt
      text: Security ahead
      link: /guide/security-ahead

features:
  - icon: 🔐
    title: Fail-Closed by Default (since 1.2.0)
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

## Mission

FLASH is the first line of privacy protection while AI is being built — RAG, agent memory, sealed documents — **anywhere**. By default `flash-zk` is strong. The developer can weaken it. Strength holds when the developer keeps the key and leaves protection on.

**`1.3.1` documents this. There is no extra code** — same engine as `1.3.0`. [What's new](/guide/whats-new)

Read your responsibility: [Mission](/guide/mission) · This week: [Do this first](/guide/do-this-first) · What we will tighten: [Security ahead](/guide/security-ahead)

## Quick Example

Run once in your project: `flashsh wrap-key` (see [flashsh CLI](/guide/flashsh-cli)).

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
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
