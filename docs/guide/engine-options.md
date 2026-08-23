# Engine Options & Durability Modes

FLASH v1.2.5+ exposes **`engineOptions`** on `FlashClient` and `FlashDatabase` for throughput tuning without sacrificing balanced crash safety.

---

## Quick Reference

```javascript
import { FlashClient } from "flash-zk";

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

::: warning Honest config
Unknown, misplaced, or mistyped options **throw** on `FlashClient`, `FlashDatabase`, and `FlashServer` — they are not silently ignored. `listTrash` / `listDeletions` also throw if that feature is disabled.
:::

## Trash archive (undo delete)

Bounded `.flash-trash` file — enabled by default on disk databases:

```javascript
engineOptions: {
  trash: {
    enabled: true,
    maxEntries: 500,
    maxBytes: 2 * 1024 * 1024,
    maxAgeMs: 7 * 24 * 3600 * 1000,
  },
},
```

See [Trash & Restore](/guide/trash-restore) for `restoreOne`, `listTrash`, and eviction rules.

---

## Deletion activity log

Optional **permanent** metadata-only log — **disabled by default** (opt-in). On disk the file is a **single deflate-compressed, AES-sealed blob** (key derived from `secretKey`).

```javascript
engineOptions: {
  deletionLog: {
    enabled: true,
  },
},
```

See [Trash & Restore — Deletion activity log](/guide/trash-restore#deletion-activity-log-optional-permanent) for `listDeletions` and purge behavior.

---

## Low-Level API

Direct `FlashArc` / `FlashOplog` usage:

```javascript
import { FlashArc } from "flash-zk/engine/arc.mjs";

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
