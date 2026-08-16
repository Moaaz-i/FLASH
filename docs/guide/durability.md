# Durability: Crash-Safe Writes & Atomic Operations

FLASH DB ensures data durability through **fsync-powered WAL writes** and **atomic SSTable operations**.

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
Client Request → WAL Frame → fsync → MemTable Update → Response
```

### fsync Behavior

The WAL automatically fsyncs after every frame append (configurable):

```js
import { FlashArc } from 'flash-db';

// Default: fsyncOnWrite = true (maximum durability)
const wal = new FlashArc('./data/mydb/mycol/wal.arc');

// Disable fsync for maximum throughput (data loss risk on crash)
const fastWal = new FlashArc('./data/fast.arc', { syncOnWrite: false });
```

### Crash Recovery

On startup, WAL records are replayed to restore in-memory state:

1. WAL file is read sequentially
2. Each frame is deserialized (opcode + key + data)
3. MemTable is reconstructed from valid frames
4. Corrupt or truncated frames are skipped with a warning

```js
// WAL recovery is automatic
const arc = new FlashArc('./data/wal.arc');
await arc.open(); // Automatically replays valid frames
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

```js
import { FlashSSTable, fsyncDir } from 'flash-db/engine/sstable.mjs';

// Atomic write is used automatically by the collection
// But you can use it directly:
await FlashSSTable.write('./data/sstable.arc', sortedEntries);
```

## Corrupt SSTable Handling

If a SSTable becomes corrupt (truncated, invalid magic, etc.):

1. Collection logs a warning with the file path
2. The corrupt SSTable is **skipped** (not loaded)
3. Remaining SSTables are loaded normally
4. The system continues operating

```js
// Corrupt files are automatically skipped on init
await collection.init();
// Warning logged: "Skipping corrupt SSTable: data.arc (truncated, expected X bytes)"
```

## Stale Temp File Cleanup

On startup, any leftover `.tmp` files from a previous crash are automatically removed:

```js
// Automatic cleanup on collection.init()
// Logs: "Removed stale temp file: data.tmp"
```

## Durability Guarantees

| Scenario | Data Safe? | Recovery |
|----------|-----------|----------|
| Crash after WAL fsync | ✅ Yes | WAL replay |
| Crash during SSTable flush | ✅ Yes | Atomic rename |
| Crash during WAL append | ✅ Yes | Corrupt frame skipped |
| Power loss mid-write | ✅ Yes | fsync ensures disk write |
| Disk failure | ⚠️ Depends | Use backup/restore |

## Backup & Restore

For full disaster recovery:

```js
import { FlashClient } from 'flash-db';

const client = new FlashClient({ secretKey: 'your-key' });

// Backup all collections
const backup = await client.backup('/backups/flash-2024-01-15');
// { bytesWritten: 1048576, files: ['col1.sst', 'col2.sst'], timestamp: '...' }

// Restore from backup
await client.restore('/backups/flash-2024-01-15', './restored-data');
```

## Performance Tuning

Disable fsync for write-heavy workloads where you can tolerate data loss:

```js
// Maximum throughput (no fsync)
const wal = new FlashArc('./data/wal.arc', { syncOnWrite: false });

// Default: maximum durability (fsync every write)
const wal = new FlashArc('./data/wal.arc'); // syncOnWrite: true
```

::: warning
Disabling fsync means data in the WAL may be lost on power failure or system crash. Only use this for non-critical data or when performance is critical.
:::
