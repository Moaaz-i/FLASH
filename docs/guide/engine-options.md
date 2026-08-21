# Engine Options & Durability Modes

FLASH v1.2.5+ exposes **`engineOptions`** on `FlashClient` and `FlashDatabase` for throughput tuning without sacrificing balanced crash safety.

---

## Quick Reference

```javascript
import { FlashClient } from "@moaaz-i/flash-db";

const client = new FlashClient({
  secretKey: "your-master-key",
  storagePath: "./flash_data",
  engineOptions: {
    durability: "balanced", // strict | balanced | throughput
    memtableThreshold: 4 * 1024 * 1024, // 4 MB default
    useWorkerFlush: true, // background SSTable writes
    deferMerkleOnWrite: true, // defer Merkle rebuild on bulk paths
  },
});
```

---

## Durability Modes

| Mode                       | WAL / Oplog behavior                                      | Use when                                 |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| **`strict`**               | `fsync` after every frame                                 | Financial logs, audit trails, max safety |
| **`balanced`** _(default)_ | Batch fsync every 64 ops or 25 ms; full sync on `close()` | Production apps, encrypted CRUD          |
| **`throughput`**           | No automatic fsync until `close()`                        | Benchmarks, bulk import, disposable data |

```javascript
// Maximum durability
engineOptions: {
  durability: "strict";
}

// Bulk import (call client.close() to flush)
engineOptions: {
  durability: "throughput";
}
```

::: tip
Always call `await client.close()` (or `collection.close()`) before exit — all modes flush pending WAL data on close.
:::

---

## Memtable Threshold

Default: **4 MB** (was 64 KB in early releases).

Larger memtables reduce flush frequency and improve write throughput:

```javascript
engineOptions: {
  memtableThreshold: 8 * 1024 * 1024, // 8 MB
}
```

---

## Worker Flush

When enabled (default), large flushes (≥512 records) run in a worker thread:

```javascript
engineOptions: {
  useWorkerFlush: true;
}
```

---

## Write Patterns

| Pattern            | Expected throughput* | Notes                              |
| ------------------ | -------------------- | ---------------------------------- |
| `insertOne` loop   | ~300 ops/sec         | Merkle + encryption per doc        |
| `insertMany` batch | ~2,500–4,000 ops/sec | Single WAL batch + deferred Merkle |
| Blind index reads  | ~5,000–6,000 ops/sec | Point lookups                      |

\*Apple Silicon / Node 20+, encrypted E2E. Run `npm run benchmark` on your hardware.

---

## Low-Level API

Direct `FlashArc` / `FlashOplog` usage:

```javascript
import { FlashArc } from "@moaaz-i/flash-db/engine/arc.mjs";

// Legacy: syncOnWrite true → strict mode
const strict = new FlashArc("./data/commit.farc", { syncOnWrite: true });

// Explicit durability
const balanced = new FlashArc("./data/commit.farc", { durability: "balanced" });
```

---

## Related

- [Durability & Crash Recovery](/guide/durability)
- [Performance Benchmarks](/api/benchmarks)
- [Production Engine](/guide/production-engine)
