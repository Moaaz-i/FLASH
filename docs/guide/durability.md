# Durability: Crash-Safe Writes & Atomic Operations

FLASH DB ensures data durability through **configurable WAL fsync** and **atomic SSTable operations**.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Memory (MemTable)                     │
│                   Read + Write Cache                      │
└─────────────────────┬────────────────────────────────────┘
                      │ flush()
                      ▼
┌──────────────────────────────────────────────────────────┐
│              Persistent Storage (SSTable)                 │
│           Write-Ahead Log (WAL) + Sorted Run              │
└──────────────────────────────────────────────────────────┘
```

## WAL (Write-Ahead Log)

Every mutation goes through the WAL before hitting memory:

```
Client Request → WAL Frame(s) → fsync (mode-dependent) → MemTable Update → Response
```

### Durability Modes (v1.2.5+)

| Mode             | Behavior                                                  | Default |
| ---------------- | --------------------------------------------------------- | ------- |
| **`strict`**     | fsync after every frame                                   | —       |
| **`balanced`**   | Batch fsync every 64 ops or 25 ms; full sync on `close()` | ✅      |
| **`throughput`** | No auto-fsync until `close()`                             | —       |

```js
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({
  secretKey: "your-key",
  engineOptions: { durability: "strict" }, // max safety
});

// Low-level WAL
import { FlashArc } from "@moaaz-yahia-zakaria/flash-db/engine/arc.mjs";
const wal = new FlashArc("./data/commit.farc", { durability: "balanced" });
```

See [Engine Options](/guide/engine-options) for full tuning.

### Crash Recovery

On startup, WAL records are replayed to restore in-memory state:

1. WAL file is read sequentially
2. Each frame is deserialized (opcode + key + data)
3. MemTable is reconstructed from valid frames
4. Corrupt or truncated frames are skipped with a warning

```js
// WAL recovery is automatic on collection.init()
await collection.init();
```

## Atomic SSTable Writes

SSTables are written atomically using a temp-file → rename pattern:

```
1. Write to .tmp file
2. fsync the .tmp file (ensure data on disk)
3. fsync the parent directory (ensure rename is durable)
4. Rename .tmp → final name
5. fsync parent directory again
```

This guarantees that either:

- The **complete** SSTable exists after a crash, or
- The **old** SSTable is intact (no partial writes)

## Durability Guarantees

| Scenario                              | Data Safe?               | Recovery                 |
| ------------------------------------- | ------------------------ | ------------------------ |
| Crash after WAL fsync / close()       | ✅ Yes                   | WAL replay               |
| Crash during SSTable flush            | ✅ Yes                   | Atomic rename            |
| Crash during WAL append (balanced)    | ⚠️ Last batch may replay | WAL replay               |
| Crash in throughput mode before close | ⚠️ Unsynced frames lost  | Partial replay           |
| Power loss mid-write (strict mode)    | ✅ Yes                   | fsync ensures disk write |

## Performance Tuning

```js
// Bulk import — call close() to flush
engineOptions: {
  durability: "throughput";
}

// Production default
engineOptions: {
  durability: "balanced";
}
```

::: warning
`throughput` mode may lose recent WAL frames on crash. Use only for disposable data or when you explicitly call `close()` before shutdown.
:::

## Related

- [Engine Options & Durability Modes](/guide/engine-options)
- [Performance Benchmarks](/api/benchmarks)
