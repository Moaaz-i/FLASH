# Buffer Pipeline (Default Performance Path)

Since **v1.3.2**, FLASH converts documents to **FlashBinary buffers** at the SDK boundary and keeps them as buffers inside the LSM engine (WAL, memtable, SSTables).

You still write **objects**. The engine works on **bytes**.

---

## Why buffers?

| Step (old) | Step (new) |
|------------|------------|
| object → encrypt object → serialize → Buffer | object → **encryptToBuffer** → Buffer |
| Buffer → **deserialize full object** → decrypt | Buffer → **getField** → decrypt partial |

Benefits:

- Fewer allocations on read/write hot paths
- Skip parsing `_blind` index payload on every `find`
- SSTable v2 already reads **block ranges** — buffers align with that model
- Same zero-knowledge encryption — crypto unchanged

---

## Developer API (FlashClient)

### Write path

```javascript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({ secretKey: "key", storagePath: "./data" });
const col = client.collection("users");

// Normal — buffer conversion is automatic
await col.insertOne({ name: "Ada", email: "ada@example.com" });

// Advanced — prepare buffer yourself (bulk, streaming, custom pipelines)
const buf = client.encryptToBuffer({ _id: "u1", name: "Ada", email: "ada@example.com" });
await col.raw.insertOne(buf);
```

### Read path

```javascript
// Normal — returns decrypted objects
const users = await col.find({ name: "Ada" }).exec();

// Advanced — read raw engine buffer
const raw = await col.raw.findOne({ _id: "u1" });
if (raw) {
  const doc = client.decryptFromBuffer(raw);
  // or field-level via FlashBinary.getField(raw, "_enc.email")
}
```

---

## FlashRecordCodec

Exported from the main package for tools, replication, and custom storage layers.

```javascript
import { FlashClient, FlashRecordCodec, FlashBinary } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({ secretKey: "key" });

// Encode
const buf = FlashRecordCodec.toBuffer(client, { name: "Test" });
const id = FlashRecordCodec.extractId(buf);

// Decode (skips full _blind parse)
const plain = FlashRecordCodec.decrypt(client, buf);

// Wire transport (remote server)
const wire = FlashRecordCodec.encodeForWire(buf);
const restored = FlashRecordCodec.decodeFromWire(wire);
```

| Method | Description |
|--------|-------------|
| `toBuffer(client, doc)` | Plain doc → encrypted FlashBinary buffer |
| `decrypt(client, bufOrObj)` | Buffer or legacy object → plain doc |
| `extractId(buf)` | Read `_id` without full deserialize |
| `extractBlind(buf)` | Read `_blind` for indexing |
| `extractPlain(buf)` | Read `_plain` metadata fields |
| `encodeForWire(buf)` | `{ _flashRecord: base64 }` for HTTP |
| `decodeFromWire(payload)` | Restore buffer from wire JSON |

---

## FlashBinary helpers

For **engine-level** code (SQL engine, Wire protocol, ETL, federation):

```javascript
import { FlashBinary } from "@moaaz-yahia-zakaria/flash-db";

const col = db.collection("items"); // FlashCollection (low-level)
const buffers = await col.find({});

// Decode when you need objects
const docs = FlashBinary.decodeRecords(buffers);

// Or single field without full parse
const email = FlashBinary.getField(buffers[0], "_enc.email");
```

---

## Layer diagram

```
┌─────────────────────────────────────────┐
│  Application                            │
│  insertOne({ ... })  find() → objects   │
├─────────────────────────────────────────┤
│  FlashClientCollection (SDK)            │
│  encryptToBuffer / decryptFromBuffer    │
├─────────────────────────────────────────┤
│  FlashCollection (engine)               │
│  Buffer in memtable, WAL, SSTables      │
├─────────────────────────────────────────┤
│  Disk (optional)                        │
│  .farc WAL · .sst segments              │
└─────────────────────────────────────────┘
```

---

## Remote mode notes

When using `uri: "flash://host:6742"`:

- Client encrypts to buffer locally
- Server stores buffer via REST
- Query responses return `_flashRecord` base64
- Client decrypts locally — **server never sees plaintext**

`insertMany` on remote currently performs sequential `insertOne` calls.

---

## When you still get objects vs buffers

| API | Returns |
|-----|---------|
| `client.collection().find().exec()` | Plain objects (decrypted) |
| `client.collection().insertOne()` | `{ insertedId, merkleRoot }` |
| `db.collection().find()` (FlashDatabase) | **`Buffer[]`** |
| `col.raw.find()` (SDK) | **`Buffer[]`** |

---

## Related

- [Release Notes](/guide/release-notes)
- [Architecture & Zero-Copy](/guide/architecture)
- [FlashClient API](/api/flash-client)
- [Client-Server Mode](/guide/client-server)
