# Performance Benchmarks

FLASH DB is designed for extreme throughput, low latency, and minimal CPU overhead.

---

## Benchmark Results

The following metrics are measured using the built-in benchmark harness on an Apple Silicon (M-series / ARM64) machine:

```
===============================================================
⚡ FLASH (FlashDB) High-Performance Engine Benchmark ⚡
===============================================================

📊 1. Binary Document Serialization (10,000 Operations)
   - Traditional JSON parse + field lookup: 506,685 ops/sec (19.74 ms)
   - FlashBinary Zero-Copy O(1) field lookup: 1,041,974 ops/sec (9.60 ms)
   🚀 FlashBinary Speedup: 2.1x FASTER than JSON!

🔐 2. Cryptographic Throughput (5,000 Operations)
   - AES-256-GCM + HMAC Blind Indexing: 80,661 ops/sec (12.40 µs/op)

💾 3. End-to-End Database Engine Throughput (2,000 Documents)
   - Encrypted Writes (WAL + SkipList + Indexes): 4,041 ops/sec (0.25 ms/op)
   - Encrypted Blind Index Point Reads: 14,679 ops/sec (0.07 ms / 70µs!)

🔒 Tamper-Proof Merkle State Root:
   11a228d4fdb706906c876bbfb880e591d5e4d32e23bdabe4cf5f35795e024b1a
===============================================================
```

---

## Running the Benchmark Locally

You can run the live benchmark directly on your hardware at any time:

```bash
npm run benchmark
```
