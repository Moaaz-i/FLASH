# Universal Foundations

FLASH ships **cross-domain primitives** on top of the core database. Use the same APIs for apps, chat, feeds, games, AI, logs — without domain-specific modules.

---

## 1. Collections (core)

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  storagePath: "./data",
  engineOptions: { durability: "balanced" },
});

const col = client.collection("anything");
await col.insertOne({ title: "Hello", createdAt: new Date() });
const docs = await col.find({ title: "Hello" });
```

---

## 2. Cursor pagination

Stable pages for feeds, chat history, logs — avoids slow `skip()`:

```javascript
let cursor = null;
do {
  const page = await col.paginate(
    { threadId: "t1" },
    { limit: 50, sort: { createdAt: -1 }, cursor },
  );
  for (const doc of page.docs) {
    /* ... */
  }
  cursor = page.nextCursor;
} while (page.hasMore);
```

---

## 3. Lifecycle (data growth)

Expire old rows, cap collection size, archive before delete:

```javascript
client.lifecycle("messages", {
  expireAfterMs: 90 * 86400000,
  maxDocuments: 500_000,
  timeField: "createdAt",
  archivePath: "./archive/messages.ndjson",
});

await client.lifecycle("messages").sweep();
```

Pair with **maintenance** for automatic sweeps.

---

## 4. Maintenance (flush + compaction)

```javascript
client.maintenance({
  sweepIntervalMs: 60_000,
  flushIntervalMs: 300_000,
  compactIntervalMs: 1_800_000,
  autoStart: true,
});

await client.maintenance().runNow(); // manual
```

---

## 5. Pipeline (import / export)

```javascript
await client
  .pipeline()
  .fromNDJSON("./seed.jsonl")
  .toCollection("users")
  .batchSize(500)
  .run();

await client
  .pipeline()
  .fromCollection("users")
  .toNDJSON("./backup.jsonl")
  .run();
```

---

## 6. Events

```javascript
client.events().subscribe("collection:orders:insert", (evt) => {
  console.log(evt.collection, evt.doc);
});

client.events().subscribe("*", (evt) => {
  /* all mutations */
});
```

Works alongside `col.watch()` (oplog change streams).

---

## 7. Plugins

```javascript
client.use({
  name: "timestamps",
  beforeInsert(doc) {
    doc.createdAt = doc.createdAt ?? new Date();
    doc.updatedAt = new Date();
    return doc;
  },
});
```

Hooks: `beforeInsert`, `beforeUpdate`, `afterInsert`, `afterUpdate`, `onRegister`.

---

## 8. Multi-tenant

```javascript
const userDb = client.tenant(userId);
await userDb.collection("data").insertOne({ ... });
```

---

## 9. Event log (append-only stream)

```javascript
const log = client.eventLog("telemetry");
await log.append({ kind: "login", userId: "u1" });
await log.appendMany([{ kind: "a" }, { kind: "b" }]);

const tail = await log.tail({}, { limit: 50 });
```

---

## 10. Counter

```javascript
const views = client.counter("page_views");
await views.increment();
const total = await views.get();
```

---

## 11. Queue (FIFO)

```javascript
const jobs = client.queue("tasks");
await jobs.enqueue({ type: "email", to: "a@b.com" }, { priority: 5 });
const job = await jobs.dequeue();
await jobs.ack(job._id);
```

---

## 12. Health & snapshot

```javascript
const stats = await client.health();
// { collections, totalDocuments, memtableBytes, sstables, ... }

await client.snapshot().exportTo("./backup.flashpack");
await client.snapshot().importFrom("./backup.flashpack");
```

---

## 13. Auto timestamps

Enabled by default (`autoTimestamps: true`):

```javascript
// inserts get createdAt + updatedAt automatically
const client = new FlashClient({ storagePath: "./flash_data" });
```

---

## 14. Buffer pipeline (default since v1.3.2)

All CRUD goes through **FlashBinary buffers** inside the engine. Your app still uses objects:

```javascript
// Automatic — no code changes
await col.insertOne({ name: "Ada" });
const docs = await col.find({ name: "Ada" }).exec();

// Advanced
const buf = client.encryptToBuffer({ name: "Ada" });
const back = client.decryptFromBuffer(buf);
```

See [Buffer Pipeline](/guide/buffer-pipeline) and [Release Notes](/guide/release-notes).

---

## 15. Performance profiles & in-memory mode

For benchmarks, tests, or ephemeral workloads:

```javascript
const client = new FlashClient({
  storagePath: "./flash_data",
  inMemory: true, // or storagePath: ':memory:'
  engineOptions: {
    performanceProfile: "turbo", // throughput + large memtable + no Merkle
  },
});
```

| Profile   | Durability   | Merkle | Memtable |
| --------- | ------------ | ------ | -------- |
| `strict`  | fsync each   | on     | 4 MB     |
| `balanced`| batched sync | on     | 4 MB     |
| `turbo`   | no fsync     | off    | 64 MB    |

**Lazy field decrypt** — `.select('name email')` decrypts only those columns (AES skipped for the rest):

```javascript
const names = await col.find({}).select("name").exec();
```

Remote server batch insert: `POST /api/v1/insertMany/:collection` with `{ encryptedRecords: [...] }` — used automatically by `insertMany()` over `uri`.

---

## 16. Compact storage (minimal disk)

```javascript
const client = new FlashClient({
  storagePath: "./flash_data",
  storageProfile: "compact",
  fieldPolicy: {
    email: "exact",
    body: "encrypted",
    tags: "plaintext",
  },
});
```

| Policy | Search | Size |
|--------|--------|------|
| `encrypted` | decrypt client-side only | smallest |
| `exact` | `find({ field: value })` | small |
| `searchable` | fuzzy / regex / range | largest |

---

## Pattern matrix

| Need                | API                                     |
| ------------------- | --------------------------------------- |
| CRUD                | `collection()`                          |
| Large lists         | `paginate()`                            |
| Old data cleanup    | `lifecycle()`                           |
| Background ops      | `maintenance()`                         |
| Bulk IO             | `pipeline()`                            |
| React to writes     | `events()` / `watch()`                  |
| Shared hooks        | `use()`                                 |
| Isolated users      | `tenant()`                              |
| Bulk mutations      | `bulkWrite()`                           |
| Time-ordered stream | `eventLog()`                            |
| Metrics / IDs       | `counter()`                             |
| Background jobs     | `queue()`                               |
| Ops visibility      | `health()`                              |
| Backup / migrate    | `snapshot()`                            |
| High-perf bytes     | `encryptToBuffer()` / `decryptFromBuffer()` |
| Max throughput      | `engineOptions: { performanceProfile: 'turbo' }` |
| Ephemeral / RAM     | `inMemory: true`                            |
| Realtime wire       | WebSocket / PubSub (see Real-Time docs) |

---

## Related

- [Release Notes](/guide/release-notes)
- [Buffer Pipeline](/guide/buffer-pipeline)
- [Engine Options](/guide/engine-options)
- [Durability](/guide/durability)
- [Real-Time Infrastructure](/guide/realtime-infrastructure)
