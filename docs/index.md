---
layout: home

hero:
  name: "FLASH DB"
  text: "Next-Gen Zero-Knowledge Encrypted Document DBMS"
  tagline: "Over 1,000,000 ops/sec with AES-256-GCM, AAD field binding, crash-safe durability, and structured logging."
  image:
    src: /logo.svg
    alt: FLASH DB
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View Architecture
      link: /guide/architecture
    - theme: alt
      text: Benchmarks
      link: /api/benchmarks

features:
  - icon: ⚡
    title: Over 1 Million Ops/Sec
    details: Zero-Copy FlashBinary format with direct offset lookup tables reads fields in constant O(1) time without parsing overhead.
  - icon: 🛡️
    title: 100% Zero-Knowledge
    details: Complete client-side encryption. The server and disk never see plaintext or keys; search runs entirely over blinded cryptographic trapdoors.
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
    title: Crash-Safe Durability
    details: WAL frames are fsync'd after every write. SSTables are written atomically (temp file → fsync → rename). Corrupt SSTables are skipped safely.
  - icon: 📊
    title: Structured Logging
    details: JSON structured logger with level filtering, sensitive key redaction, and integration with ELK, Datadog, Grafana Loki, and CloudWatch.
  - icon: 🌲
    title: Tamper-Proof Merkle Roots
    details: Instant cryptographic verification proofs. Detect any unauthorized modifications or disk injections immediately.
  - icon: 🏗️
    title: Modern LSM-Tree Engine
    details: Lock-Free SkipList MemTable + Append-Only WAL + Bloom Filtered Compressed SSTable segments with atomic writes.
---

## Quick Example

```javascript
import { FlashClient } from '@moaaz-yahia-zakaria/flash-db';

// 1. Initialize Client with Master Secret Key
const client = new FlashClient({
  secretKey: 'quantum_production_passphrase_2026',
  storagePath: './data'
});

const users = client.collection('users', {
  schema: {
    name: { type: 'string', required: true, trim: true },
    email: { type: 'string', required: true, unique: true },
    balance: { type: 'number', default: 0 }
  }
});

// 2. Insert Document (Encrypted on Client Side with AAD binding)
const { insertedId } = await users.insertOne({
  name: 'Ada Lovelace',
  email: 'ada@computing-pioneer.org',
  role: 'Mathematician',
  balance: 45000,
  status: 'active'
});

// 3. Search Over Encrypted Blind Indexes (Server remains 100% blind)
const results = await users
  .find({ email: 'ada@computing-pioneer.org' })
  .sort({ balance: -1 })
  .limit(10);

console.log(results[0].name); // 'Ada Lovelace'

// 4. Natural Language Query (AI Engine)
const nlResults = await users.ask('show me users with balance over 30000', { limit: 5 });

// 5. Backup & Restore
await client.backup('/backups/flash-daily');
```
