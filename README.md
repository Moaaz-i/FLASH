<div align="center">

# ⚡ FLASH DB

**Zero-Knowledge Encrypted Intelligence Database — Local-First, AI-Native, Server-Blind**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-194%2F194%20Passing-brightgreen.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docs](https://img.shields.io/badge/Docs-VitePress-blue.svg)](https://moaaz-i.github.io/FLASH/)
[![npm version](https://img.shields.io/npm/v/flash-zk.svg)](https://www.npmjs.com/package/flash-zk)

_Architectural zero-knowledge: sealed envelopes and blind indexes so the engine is designed not to hold your keys or plaintext. Built for private AI and local-first apps._

**[What's new in 1.2.0](https://moaaz-i.github.io/FLASH/guide/whats-new)** · **[Trust model & audit roadmap](https://moaaz-i.github.io/FLASH/guide/trust-model)** · **[Release Notes](https://moaaz-i.github.io/FLASH/guide/release-notes)** · **[Positioning](https://moaaz-i.github.io/FLASH/guide/positioning)** · **[5-Min Start](https://moaaz-i.github.io/FLASH/guide/getting-started#intelligence-in-5-minutes)**

</div>

---

## What FLASH Is

**FLASH** is a **zero-knowledge document engine** — a standalone database, not a plugin on top of another store.

| Pillar                     | Meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **Server-blind by design** | AES-256-GCM, blind indexes, and ORE range tokens are the foundation — not optional plugins |
| **AI-native storage**      | HNSW vector search, semantic cache, RAG context optimizer, and LLM tool-calling built in   |
| **Local-first**            | Embedded in-process or over the FLASH wire protocol — your data stays under your key       |
| **FLASH formats**          | `FlashBinary`, `.farc` WAL, `.flog` oplog — purpose-built, zero-copy, LSM-backed           |

### FLASH-Exclusive (this stack in one engine)

| Module                | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `FlashPrivateRAG`     | Encrypted ingest → chunk → embed → ask — private RAG, server-blind |
| `FlashAgentMemory`    | AI agent episodic memory — semantic recall, TTL, importance        |
| `FlashSealedVault`    | Passphrase vault with auto-lock — isolated secret domain           |
| `FlashIntegrityProof` | Signed Merkle + invariant manifest for integrity checks            |

> **FLASH answers one question:** _How do you store, query, and search documents when the engine must remain cryptographically blind?_

> **Honesty:** “Zero-knowledge” here means **architectural hiding**, not zk-SNARKs and not a completed external audit. See [Trust Model](https://moaaz-i.github.io/FLASH/guide/trust-model).

---

## What's new in 1.2.0

FLASH **fails closed**. Setups that used to start without keys or with public binds now refuse to start.

- **`FlashServer` / gRPC / replication** require a strong `authKey`. Binding `0.0.0.0` also requires `allowPublicBind: true`. Only `/health` is unauthenticated.
- **Remote `FlashClient.uri`** requires `authKey`. The Intelligence Console requires `token`. `GET /api/docs` stays off unless `allowDataExplorer: true`.
- **Weak or short secrets** are rejected. `fieldPolicy: plaintext` needs `allowPlaintextFields: true`.
- **CLI:** `flash-server` needs `FLASH_AUTH_KEY`; `flash-console` needs `FLASH_MASTER_KEY` and prints `x-flash-token`.
- From **1.1.0:** `FlashZKKernel` keeps plaintext off the wire; SQL/GraphQL take `FlashClient` only.

[Full announcement](https://moaaz-i.github.io/FLASH/guide/whats-new) · [Release notes](https://moaaz-i.github.io/FLASH/guide/release-notes)

---

## Key Highlights

- **Architectural zero-knowledge**: Client-side AES-256-GCM envelopes; storage and network daemons are designed to hold ciphertext, trapdoors, and ORE tokens — not your `secretKey` or plaintext. Limits and leakage: [Trust Model](https://moaaz-i.github.io/FLASH/guide/trust-model).
- **Fail-closed defaults (1.2.0)**: Strong `authKey` / console `token`, weak-secret rejection, plaintext fields and public bind only via explicit opt-in.
- **Fast binary path**: `FlashBinary` zero-copy field lookups (see [benchmarks](https://moaaz-i.github.io/FLASH/api/benchmarks) — not the same as full encrypted write throughput).
- **Vector quantization (SQ8 & 1-bit)**: Compact high-dimensional vectors with Hamming / quantized distance paths.
- **Polyglot NL query compiler**: Natural-language shaped queries across many scripts (evaluate for your language pair).
- **AI agent tools & function calling**: Tool registry with multi-turn loops over collections and external APIs.
- **RAG context optimizer & RRF**: Merge vector + BM25 ranks and trim context for lower token use.
- **Semantic cache**: L1 memory + L2 disk tiers for repeated embedding/query workloads.
- **HNSW vector search**: Approximate nearest neighbor for private RAG embeddings.
- **Searchable encrypted indexes**: Exact trapdoors, substring n-grams, and ORE / bucketed range filters (`$gt`, `$lt`) — with known SSE leakage trade-offs.
- **Homomorphic-style aggregates**: `$sum` / `$inc` over sealed numeric fields without server plaintext.
- **LSM-tree engine**: SkipList memtable + `.farc` durability + bloom-filtered SSTables + tiered compaction.
- **ACID & snapshot isolation**: MVCC; distributed 2PC available for sharded setups.
- **Observability & ETL**: Prometheus `/metrics`, NDJSON / CSV import & export.
- **Realtime helpers**: WebSocket rooms, presence, pub/sub wildcards.
- **TypeScript definitions**: First-class `index.d.ts` and generic collections.

---

## 📖 Documentation

**[Full Documentation (VitePress)](https://moaaz-i.github.io/FLASH/)**

---

## 📦 Installation

```bash
npm install flash-zk
```

---

## ⚡ Quick Start

```typescript
import { FlashClient } from "flash-zk";

// 1. Initialize Client with Master Secret Key
const client = new FlashClient({
  secretKey: "quantum_production_passphrase_2026",
  storagePath: "./flash_data",
});

interface User {
  _id?: string;
  name: string;
  email: string;
  role: string;
  balance: number;
}

const users = client.collection<User>("users");

// 2. Insert Document (Automatically encrypted on client side)
const result = await users.insertOne({
  name: "Ada Lovelace",
  email: "ada@computing-pioneer.org",
  role: "Mathematician",
  balance: 45000,
});

console.log(
  `Inserted ID: ${result.insertedId} | State Root: ${result.merkleRoot}`,
);

// 3. Search over encrypted blind indexes (engine sees trapdoors, not plaintext values)
const found = await users.find({ email: "ada@computing-pioneer.org" });
console.log(found[0].name); // 'Ada Lovelace'
```

---

## Trust & audits

FLASH is open source and fail-closed by default. It does **not** yet have a published independent security audit. Known limits (SSE leakage, client-as-root-of-trust, no zk-SNARKs) and the public roadmap live here:

**[Trust Model & Audit Roadmap](https://moaaz-i.github.io/FLASH/guide/trust-model)**

---

## AI Vector Search & Private RAG (HNSW)

```typescript
import { FlashHNSWIndex } from "flash-zk";

const hnsw = new FlashHNSWIndex({
  M: 16,
  efConstruction: 64,
  metric: "cosine",
});

// Insert 1536-dimensional embeddings
hnsw.insert("doc_1", [0.014, -0.052, 0.841 /* ... */]);
hnsw.insert("doc_2", [0.019, -0.048, 0.82 /* ... */]);

// Query Top-K Nearest Neighbors in O(log N) time
const matches = hnsw.search([0.015, -0.05, 0.835], 5);
console.log(matches);
// [{ docId: 'doc_1', score: 0.9988 }, ...]
```

---

## 📊 Architecture Overview

```
Client Application (Plaintext)
       ↓ (FlashClient SDK: AES-256-GCM + Blind Index Trapdoors + ORE)
Network / Local Process Boundary (Zero-Knowledge Envelope)
       ↓
FlashDatabase Engine
 ├── In-Memory L0: FlashMemTable (SkipList)
 ├── Durability:   FlashArc (.farc Append-Only Vault)
 ├── Concurrency:  FlashMVCC (Snapshot Isolation)
 ├── On-Disk L1:   FlashSSTable (Bloom Filter + Compressed Blocks)
 ├── Optimization: FlashCompactor (Tiered Compaction & Tombstone Eviction)
 └── Telemetry:    FlashMetrics (Prometheus /metrics)
```

---

## Running Tests & Benchmarks

```bash
# Run the test suite
npm test

# Run performance benchmarks (see docs for workload notes)
npm run benchmark

# Bootstrap intelligence workspace
npx flashsh init

# Start Intelligence Console
npx flash-console
# → http://localhost:3456
```

---

## 📄 License

Apache-2.0 © 2026 Moaaz Yahia Zakaria
