# Release Notes (Developer Guide)

What changed in recent FLASH releases and how to adopt it in your apps.

**Current version:** `1.0.0` · **Tests:** 155/155

---

## v1.0.0 — npm `flash-zk`

npm rejected the unscoped name `flash-db` (too similar to the existing `flashdb` package). The scoped name `@moaaz-i/flash-db` requires creating the `@moaaz-i` org on npm first.

The official npm name is **`flash-zk`** (short, unscoped, zero-knowledge):

```bash
npm install flash-zk
```

```js
import { FlashClient } from "flash-zk";
```

---

## v1.3.2 — Default Buffer Pipeline

### Summary

The engine now keeps records as **FlashBinary `Buffer`s end-to-end**. The SDK still accepts and returns **plain JavaScript objects** — conversion happens once at the client boundary.

```
Your app (object) → encryptToBuffer() → Buffer → WAL / SSTable
WAL / SSTable → Buffer → decryptFromBuffer() → Your app (object)
```

### New APIs

| API                               | Where         | Purpose                                             |
| --------------------------------- | ------------- | --------------------------------------------------- |
| `client.encryptToBuffer(doc)`     | `FlashClient` | Plain doc → encrypted `Buffer` (one serialize)      |
| `client.decryptFromBuffer(buf)`   | `FlashClient` | Encrypted `Buffer` → plain doc (partial field read) |
| `FlashRecordCodec`                | export        | Low-level encode/decode helpers                     |
| `FlashBinary.decodeRecord(buf)`   | export        | Engine buffer → object (for SQL/Wire/etc.)          |
| `FlashBinary.decodeRecords(bufs)` | export        | Batch decode                                        |

### Behavior changes (low-level)

If you use **`FlashCollection` directly** (not `FlashClient.collection()`):

| Method         | Before           | Now                    |
| -------------- | ---------------- | ---------------------- |
| `find()`       | `object[]`       | `Buffer[]`             |
| `findOne()`    | `object \| null` | `Buffer \| null`       |
| `insertOne()`  | object only      | `object \| Buffer`     |
| `insertMany()` | object[] only    | `(object \| Buffer)[]` |

Use `FlashBinary.decodeRecord()` when you need plain objects from engine buffers.

### Remote / FlashServer wire format

Records over HTTP are sent as:

```json
{ "_flashRecord": "<base64 FlashBinary buffer>" }
```

The remote client decodes automatically. **No app changes** if you use `FlashClient` with `uri`.

`insertMany` over remote uses **`POST /api/v1/insertMany/:collection`** (single round-trip batch).

### Performance (v1.3.2)

| Feature                | API                                                              |
| ---------------------- | ---------------------------------------------------------------- |
| Turbo profile          | `engineOptions: { performanceProfile: 'turbo' }`                 |
| In-memory engine       | `inMemory: true` or `storagePath: ':memory:'`                    |
| Lazy field decrypt     | `.select('field1 field2')`                                       |
| Partial buffer decrypt | `FlashRecordCodec.decryptFields()` / `decryptFieldsFromBuffer()` |
| Skip Merkle (turbo)    | `disableMerkle: true` (turbo default)                            |

See [Foundations §15](/guide/foundations#_15-performance-profiles-in-memory-mode).

### Compact storage (`storageProfile: 'compact'`)

Minimal on-disk footprint — use for bulk archives and non-searchable payloads:

```javascript
const client = new FlashClient({
  secretKey: "key",
  storageProfile: "compact",
  fieldPolicy: {
    title: "exact", // equality search only
    body: "encrypted", // encrypt only — smallest
    tags: "plaintext", // compressible metadata
  },
  engineOptions: { compressionLevel: 6 },
});
```

| Policy                    | Blind index            | Typical size vs `searchable`  |
| ------------------------- | ---------------------- | ----------------------------- |
| `encrypted` / `zk-secret` | none                   | **~5–15× smaller** (strings)  |
| `exact`                   | exact trapdoor only    | **~3–8× smaller**             |
| `searchable`              | exact + ngrams + range | baseline                      |
| `plaintext`               | none                   | smallest + SSTable compresses |

### Plugin hooks

`beforeUpdate` and `afterUpdate` are fully supported:

```javascript
client.use({
  name: "audit",
  beforeUpdate(doc, col, previous) {
    doc.lastEditedBy = "system";
    return doc;
  },
  afterUpdate(doc, col) {
    console.log("updated", doc._id);
  },
});
```

### TypeScript

- `FlashQueryWhereBuilder<T>` — fixes fluent `.where().gt()` typing
- `FlashRecordCodec`, `encryptToBuffer`, `decryptFromBuffer`
- `FlashCollection` buffer return types
- `FlashPlugin.afterUpdate`
- `FlashDatabase` constructor accepts `engineOptions`

See [Buffer Pipeline](/guide/buffer-pipeline) and [TypeScript Support](/guide/typescript).

---

## v1.3.1 — Engine Fixes + Foundations

### Bug fixes

| Issue                        | Fix                                                       |
| ---------------------------- | --------------------------------------------------------- |
| TTL only scanned memtable    | TTL sweeps **memtable + SSTables**                        |
| `getMerkleProof()` async bug | Sync returns `null` if dirty; use `getMerkleProofAsync()` |
| `count()` loaded all docs    | Uses engine `count()` when no filter                      |
| Missing `beforeUpdate` hook  | Added on `updateOne`                                      |
| Schema `expireAfterSeconds`  | Also registers `lifecycle()`                              |

### New client foundations

| API                              | Use case                        |
| -------------------------------- | ------------------------------- |
| `client.eventLog(name)`          | Append-only time-ordered stream |
| `client.counter(name)`           | Atomic counters                 |
| `client.queue(name)`             | FIFO jobs with ack/fail         |
| `client.health()`                | Engine capacity report          |
| `client.snapshot()`              | `.flashpack` export/import      |
| `autoTimestamps: true` (default) | Auto `createdAt` / `updatedAt`  |

See [Universal Foundations](/guide/foundations).

---

## v1.3.0 — Universal Foundations (Cross-Domain)

Introduced generic primitives instead of domain-named modules:

- `lifecycle()`, `paginate()`, `maintenance()`, `pipeline()`
- `events()`, `use()` plugins, `tenant()`
- Positioning as **zero-knowledge encrypted intelligence DB**

See [Positioning & Identity](/guide/positioning).

---

## Migration checklist

### From ≤1.3.0 → 1.3.2

1. **No breaking changes** if you only use `FlashClient.collection()` CRUD.
2. **Engine-level code** (`FlashDatabase.collection().find()`): decode buffers with `FlashBinary.decodeRecord()`.
3. **Custom server clients**: expect `_flashRecord` base64 over REST if reading raw responses.
4. **Enable timestamps**: default on — pass `autoTimestamps: false` to disable.
5. **Run tests** after upgrade; 146 tests cover buffer + remote + foundations paths.

### Recommended client setup (2026)

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: process.env.FLASH_SECRET_KEY,
  storagePath: "./data",
  engineOptions: { durability: "balanced" },
  autoTimestamps: true,
});

// Foundations
client.maintenance({ autoStart: true });
const log = client.eventLog("events");
const jobs = client.queue("tasks");
```

---

## Related

- [Buffer Pipeline](/guide/buffer-pipeline)
- [Universal Foundations](/guide/foundations)
- [FlashClient API](/api/flash-client)
- [Client-Server Mode](/guide/client-server)
- [TypeScript Support](/guide/typescript)
