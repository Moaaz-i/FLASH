# LSM-Tree Background Compactor & Storage Optimization

**FLASH DB** uses an enterprise-grade **LSM-Tree Compaction Engine** (`FlashCompactor`) to manage on-disk SSTable files, purge tombstones, and prevent Disk Bloat.

---

## Why Compaction is Essential

In an append-only LSM-Tree storage engine:
1. Updates and deletes write new versions or tombstones to disk without modifying existing files.
2. Over time, multiple SSTable segment files accumulate.
3. **Compaction** reads multiple SSTables, collapses them into a single sorted SSTable, removes deleted records, and deletes old files atomically.

```
Before Compaction:
[ SSTable 1: 50MB ] + [ SSTable 2: 30MB ] + [ SSTable 3: 20MB (Tombstones) ]
                                    ↓ (FlashCompactor)
After Compaction:
[ Compacted SSTable Level-1: 65MB ] (All stale versions & tombstones purged!)
```

---

## Usage Examples

### 1. Manual Collection Compaction

```javascript
import { FlashCollection } from 'flash-db';

const col = new FlashCollection('audit_logs', './data');
await col.init();

// Flush and compact all SSTables in the collection
const report = await col.compact();

console.log(report);
// {
//   compacted: true,
//   originalFiles: 5,
//   totalRecordsMerged: 120000
// }
```

---

### 2. Automated Background Compaction Worker

```javascript
import { FlashCompactor, FlashDatabase } from 'flash-db';

const db = new FlashDatabase('prod_db', { storagePath: './data' });
const users = db.collection('users');
const orders = db.collection('orders');

// Initialize Compactor with automated interval
const compactor = new FlashCompactor({
  maxSSTablesBeforeCompact: 4,  // Compact when >= 4 SSTables accumulate
  compactionIntervalMs: 60000   // Check every 60 seconds
});

// Start background worker
compactor.start([users, orders]);

// Graceful shutdown
// compactor.stop();
```
