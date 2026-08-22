# Trash & Restore (Undo Delete)

Every delete is archived automatically into a **single compressed, encrypted file** — `.flash-trash` — so you can **restore** recently deleted documents without a full backup.

Hard delete still applies to the LSM engine (fast, small). Trash is a **bounded undo window** on the side.

---

## How it works

```
deleteOne(doc)
    │
    ├─► archive → .flash-trash (zstd-style deflate + AES, FIFO cap)
    │
    └─► hard delete from WAL / memtable / indexes

restoreOne(docId)  →  read trash  →  insertOne  →  remove from trash
```

| Layer                      | Behavior                                               |
| -------------------------- | ------------------------------------------------------ |
| **FlashClientCollection**  | Archives decrypted JSON (best compression)             |
| **FlashCollection (raw)**  | Archives engine buffer on internal deletes (TTL, etc.) |
| **In-memory (`:memory:`)** | Trash disabled — no `.flash-trash` file                |

---

## Quick start

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: "your-key",
  storagePath: "./data",
});

const notes = client.collection("notes");

await notes.insertOne({ _id: "n1", title: "Draft", body: "..." });

// Delete — automatically archived
await notes.deleteOne({ _id: "n1" });

// Undo
const result = await notes.restoreOne("n1");
console.log(result); // { restored: true, docId: "n1" }

const doc = await notes.findOne({ _id: "n1" });
console.log(doc.title); // "Draft"
```

---

## API

### `restoreOne(docId)`

Restores a document from trash if it still exists and is not already live.

```javascript
const result = await notes.restoreOne("n1");
// { restored: true, docId: "n1" }
// { restored: false, docId: "n1", reason: "not_in_trash" | "document_exists" | "empty_trash_entry" }
```

### `listTrash(options?)`

Lists recoverable deletions (metadata only — no full document bodies).

```javascript
const entries = await notes.listTrash({ limit: 20 });
// [{ collection, docId, deletedAt, kind: "json"|"buffer", compressedBytes }]
```

### `purgeTrash()`

Clears all trash entries (collection helper delegates to the shared vault).

```javascript
await notes.purgeTrash();
// or database-wide:
await client.purgeTrash();
```

---

## Configuration

Trash is **enabled by default** on disk-backed databases. Tune limits via `engineOptions.trash`:

```javascript
const client = new FlashClient({
  secretKey: "your-key",
  storagePath: "./data",
  engineOptions: {
    trash: {
      enabled: true, // default: true
      maxEntries: 500, // FIFO — oldest dropped first
      maxBytes: 2 * 1024 * 1024, // 2 MB compressed cap
      maxAgeMs: 7 * 24 * 3600 * 1000, // 7 days
    },
  },
});
```

Disable entirely:

```javascript
engineOptions: {
  trash: {
    enabled: false;
  }
}
```

Payloads are encrypted with a key derived from your `secretKey` (`trashSecret` internally). Trash does **not** weaken zero-knowledge for live data.

---

## Limits & eviction

When any limit is exceeded, **oldest entries are removed first** (FIFO):

1. **`maxEntries`** — e.g. keep last 500 deletes
2. **`maxBytes`** — total compressed trash file size
3. **`maxAgeMs`** — entries older than N ms are purged on write

After eviction, `restoreOne` returns `{ restored: false, reason: "not_in_trash" }`.

Compaction of SSTables does **not** affect trash — trash is independent of LSM compaction.

---

## Trash vs backup vs time-travel

| Feature                             | Use case                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| **Trash**                           | Quick undo for recent deletes; tiny disk footprint                 |
| **`client.backup()` / `restore()`** | Full database snapshot                                             |
| **`FlashTimeTravel` (MVCC)**        | Historical reads in transactional layer — not wired to `deleteOne` |

---

## File location

```
{storagePath}/{dbName}/.flash-trash
```

Single file for **all collections** in the database.

---

## Low-level: `FlashTrashVault`

```javascript
import { FlashTrashVault } from "flash-zk";

const vault = new FlashTrashVault("./data/my_db/.flash-trash", {
  maxEntries: 100,
  trashSecret: "derived-or-custom-secret",
});

await vault.open();
await vault.archive({
  collection: "users",
  docId: "u1",
  doc: { _id: "u1", name: "Ada" },
});
const item = await vault.peek("u1", "users");
await vault.close();
```

Most apps should use `FlashClientCollection.restoreOne` instead of calling the vault directly.
