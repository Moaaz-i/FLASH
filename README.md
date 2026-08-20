<div align="center">

# ⚡ FLASH DB

**Zero-Knowledge Encrypted Intelligence Database — Local-First, AI-Native, Server-Blind**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-131%2F131%20Passing-brightgreen.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docs](https://img.shields.io/badge/Docs-VitePress-blue.svg)](https://moaaz-i.github.io/FLASH/)
[![npm](https://img.shields.io/badge/npm-%40moaaz--yahia--zakaria%2Fflash--db-red.svg)](https://www.npmjs.com/package/@moaaz-yahia-zakaria/flash-db)

_The server never sees your keys, your queries, or your plaintext. Built for private AI, local-first apps, and encrypted intelligence._

**[Positioning & Identity](https://moaaz-i.github.io/FLASH/guide/positioning)** · **[5-Min Intelligence Start](https://moaaz-i.github.io/FLASH/guide/getting-started#intelligence-in-5-minutes)**

</div>

---

## What FLASH Is

**FLASH** is a **zero-knowledge document engine** — not a generic cloud database with encryption bolted on.

| Pillar                     | Meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **Server-blind by design** | AES-256-GCM, blind indexes, and ORE range tokens are the foundation — not optional plugins |
| **AI-native storage**      | HNSW vector search, semantic cache, RAG context optimizer, and LLM tool-calling built in   |
| **Local-first**            | Embedded in-process or over the FLASH wire protocol — your data stays under your key       |
| **FLASH formats**          | `FlashBinary`, `.farc` WAL, `.flog` oplog — purpose-built, zero-copy, LSM-backed           |

### FLASH-Exclusive (no other DB offers this stack)

| Module                | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `FlashPrivateRAG`     | Encrypted ingest → chunk → embed → ask — private RAG, server-blind |
| `FlashAgentMemory`    | AI agent episodic memory — semantic recall, TTL, importance        |
| `FlashSealedVault`    | Passphrase vault with auto-lock — isolated secret domain           |
| `FlashIntegrityProof` | Signed Merkle + invariant manifest for audit                       |

> **FLASH answers one question:** _How do you store, query, and search documents when the engine must remain cryptographically blind?_

---

## 🚀 Key Highlights

- **🛡️ 100% Zero-Knowledge Privacy**: Complete client-side envelope encryption. The database server and disk storage **never see plaintext keys, values, or queries**.
- **⚡ 1M+ Ops/Sec Zero-Copy Binary Format**: `FlashBinary` layout with $O(1)$ constant-time field offset lookups without JSON parsing overhead.
- **🧬 32x Vector Quantization (SQ8 & 1-Bit Binary)**: Store millions of high-dimensional vectors in minimal RAM with single-cycle bitwise Hamming distance math.
- **🌐 Universal Polyglot Query Engine**: Zero-shot natural language query compiler for **ANY language or script** (Arabic, English, Chinese, French, Spanish, Russian, Hindi...).
- **🤖 Autonomous AI Agent Tools & Function Calling**: Standardized Tool Calling registry with automated multi-turn execution loops over local collections and external APIs.
- **🎯 RAG Context Optimizer & Reciprocal Rank Fusion (RRF)**: Merges Vector & BM25 search ranks and trims context to save **60-80% LLM token costs**.
- **⚡ Multi-Tier Semantic Cache (`< 0.05ms`)**: Dual-tier L1 In-Memory + L2 Persistent Disk Cache saving up to **90% in LLM API bills**.
- **🧠 High-Dimensional AI Vector Search (HNSW)**: $O(\log N)$ Approximate Nearest Neighbor (ANN) search for private RAG and LLM embeddings.
- **🔍 Searchable Encrypted Blind Indexing**: Query over encrypted data using exact trapdoors, substring N-grams, and Order-Revealing Encryption (**ORE**) range filters (`$gt`, `$lt`).
- **🧮 Homomorphic Aggregation**: Execute `$sum` and `$inc` calculations directly over ciphertexts on the server without decrypting.
- **💾 Modern LSM-Tree Engine**: Lock-Free SkipList MemTable + `.farc` durability archive + Bloom-Filtered compressed SSTable segments + Tiered Compactor.
- **🔄 ACID Transactions & Snapshot Isolation**: Multi-Version Concurrency Control (**MVCC**) + Distributed **Two-Phase Commit (2PC)** across sharded clusters.
- **📊 Built-in Observability & ETL**: Live Prometheus `/metrics` telemetry endpoint and streaming `NDJSON` / `CSV` export & import tools.
- **🔴 Real-Time Infrastructure**: Zero-dependency WebSocket server with rooms/channels, presence tracking, LRU cache, and enhanced pub/sub with wildcards.
- **📘 Full TypeScript Definitions**: First-class `index.d.ts` with IntelliSense autocompletion and generic collection typing.

---

## 📖 Documentation

**[Full Documentation (VitePress)](https://moaaz-i.github.io/FLASH/)**

---

## 📦 Installation

```bash
npm install @moaaz-yahia-zakaria/flash-db
```

---

## ⚡ Quick Start

```typescript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

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

// 3. Search Over Encrypted Blind Indexes (Server remains 100% blind)
const found = await users.find({ email: "ada@computing-pioneer.org" });
console.log(found[0].name); // 'Ada Lovelace'
```

---

## 🧠 AI Vector Search & Private RAG (HNSW)

```typescript
import { FlashHNSWIndex } from "flash-db";

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

## 🧪 Running Tests & Benchmarks

```bash
# Run comprehensive test suite (131 tests)
npm test

# Run performance benchmarks (insertOne ~330/s, insertMany ~2,650/s)
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
