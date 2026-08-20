# Performance Benchmarks

FLASH is tuned for **honest encrypted throughput** — batch writes, balanced durability, and deferred Merkle rebuilds on bulk paths.

---

## Benchmark Results (v1.2.5)

Measured with `npm run benchmark` on Apple Silicon (Node 20+):

```
===============================================================
⚡ FLASH High-Performance Engine Benchmark ⚡
===============================================================

🔧 Engine profile: durability=balanced, memtable=4MB, worker flush=on

📊 1. Binary Document Serialization (10,000 Operations)
   - Traditional JSON parse + field lookup:   ~230,000 ops/sec
   - FlashBinary Zero-Copy O(1) field lookup: ~400,000 ops/sec
   🚀 FlashBinary Speedup: ~1.7x vs JSON

🔐 2. Cryptographic Throughput (5,000 Operations)
   - AES-256-GCM + HMAC Blind Indexing: ~26,000 ops/sec

💾 3. End-to-End Database Engine Throughput (2,000 Documents)
   - insertOne (balanced WAL batching):     ~330 ops/sec
   - insertMany turbo batch (2,000 docs):   ~2,650 ops/sec
   - Encrypted Blind Index Point Reads:     ~6,000 ops/sec

🔒 Tamper-Proof Merkle State Root: (computed via refreshMerkleRoot)
===============================================================
```

::: info
**1M+ ops/sec** refers to **FlashBinary zero-copy field lookups** — not encrypted end-to-end writes. Always check the benchmark section that matches your workload.
:::

---

## Workload Guide

| Workload                    | Recommended API | Durability                 |
| --------------------------- | --------------- | -------------------------- |
| Single encrypted inserts    | `insertOne`     | `balanced` (default)       |
| Bulk import / seed data     | `insertMany`    | `balanced` or `throughput` |
| Audit / financial log       | `insertOne`     | `strict`                   |
| Benchmark / disposable data | `insertMany`    | `throughput` + `close()`   |

See [Engine Options](/guide/engine-options) for configuration.

---

## Running Locally

```bash
npm run benchmark
```

Results vary by CPU, disk (SSD vs HDD), and Node version.

---

## What Changed in v1.2.5

| Setting               | Before            | After                             |
| --------------------- | ----------------- | --------------------------------- |
| Memtable threshold    | 64 KB             | 4 MB                              |
| Default durability    | fsync every write | `balanced` (batch 64 ops / 25 ms) |
| Bulk oplog            | per-doc append    | `appendBatch`                     |
| L0 compaction trigger | 4 SSTables        | 8 SSTables                        |
