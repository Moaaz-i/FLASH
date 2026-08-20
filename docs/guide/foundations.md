# Universal Foundations

FLASH ships **cross-domain primitives** on top of the core database. Use the same APIs for apps, chat, feeds, games, AI, logs — without domain-specific modules.

---

## 1. Collections (core)

```javascript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({
  secretKey: "your-master-key",
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
  for (const doc of page.docs) { /* ... */ }
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
await client.pipeline()
  .fromNDJSON("./seed.jsonl")
  .toCollection("users")
  .batchSize(500)
  .run();

await client.pipeline()
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

client.events().subscribe("*", (evt) => { /* all mutations */ });
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

Hooks: `beforeInsert`, `afterInsert`, `afterUpdate`, `onRegister`.

---

## 8. Multi-tenant

```javascript
const userDb = client.tenant(userId);
await userDb.collection("data").insertOne({ ... });
```

---

## Pattern matrix

| Need | API |
|------|-----|
| CRUD | `collection()` |
| Large lists | `paginate()` |
| Old data cleanup | `lifecycle()` |
| Background ops | `maintenance()` |
| Bulk IO | `pipeline()` |
| React to writes | `events()` / `watch()` |
| Shared hooks | `use()` |
| Isolated users | `tenant()` |
| Bulk mutations | `bulkWrite()` |
| Realtime wire | WebSocket / PubSub (see Real-Time docs) |

---

## Related

- [Engine Options](/guide/engine-options)
- [Durability](/guide/durability)
- [Real-Time Infrastructure](/guide/realtime-infrastructure)
