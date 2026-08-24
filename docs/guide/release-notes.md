# Release Notes (Developer Guide)

What changed in recent FLASH releases and how to adopt it in your apps.

**Current version:** `1.2.0` · **Tests:** 194/194

**[What's new in 1.2.0](/guide/whats-new)** — fail-closed auth, bind, console, and plaintext policy. If you are upgrading from 1.0.x, also read the 1.1.0 kernel changes below.

---

## v1.2.0 — Trust defaults (fail closed)

Network and key handling now refuse insecure configurations instead of hoping the operator notices.

- **`secretKey` strength**: at least 16 bytes in apps (8 in the test runner). Common weak strings are rejected.
- **`FlashServer` requires `authKey`**. Binding `0.0.0.0` also requires `allowPublicBind: true`. `/health` stays public; everything else needs `x-flash-server-key`. Per-IP rate limit (200 / 10s).
- **Remote `FlashClient.uri` requires `authKey`.**
- **Intelligence Console requires `token`.** Document explorer (`GET /api/docs`) is off unless `allowDataExplorer: true`.
- **`fieldPolicy: plaintext` requires `allowPlaintextFields: true`.**
- **gRPC and replication daemons require `authKey`.** Replica sets generate a cluster key automatically.
- **CLI**: `flash-server` defaults to `127.0.0.1` and exits without `FLASH_AUTH_KEY` / `--authKey`. `flash-console` requires `FLASH_MASTER_KEY` and prints a dashboard token.
- Blind counters carry an HMAC tag so tampered hex is not mixed into sums blindly.
- **Performance (crypto unchanged):** in-process PBKDF2 cache, lazy trash/deletion ciphers, `_enc` checks without JSON-parsing ciphertext, FAR2 CRC-32 WAL checksums (AES-GCM still authenticates records). Legacy FARC files still recover.

This is still not a formal proof system or an external pentest. It is fail-closed engineering.

---

## v1.1.0 — Architectural zero-knowledge + independent identity

FLASH is a **standalone** encrypted intelligence database. Companion framing to other document stores is removed.

### Zero-knowledge kernel

- **`FlashZKKernel`** — the engine and network daemons refuse unsealed plaintext records and plaintext query fields.
- **`FlashServer` / `FlashGRPCServer` / replication** accept sealed envelopes and trapdoor queries only. `secretKey` never belongs on the server.
- **`FlashSQL.execute(client, sql)`** and **`FlashGraphQL(client)`** require `FlashClient`. The storage engine does not evaluate SQL/GraphQL over plaintext.
- **`FlashRBAC`** can be passed to `FlashServer` (`x-flash-user`). Operations are authorized without reading document contents.
- Query responses include a **Merkle root** of sealed records so clients can verify inclusion without the server knowing values.

### Identity

- Positioning, examples, and docs no longer describe FLASH as a sidecar to another database.
- `FlashClient.uri` accepts only FLASH URLs (`flash://`, `http://`, `https://`).
- New example: `examples/standalone-vault`.

### Honesty

- Key agreement is **ECDH + SHA3**, not ML-KEM/Kyber. `pqcHardened` is scrypt + SHA3 passphrase stretching.
- Additive counters remain **masked group sums**, not Paillier/BFV. See [Homomorphic Math](/guide/homomorphic-math).

**Breaking:** `FlashSQL.execute` and `FlashGraphQL` no longer take `FlashDatabase`. Pass `FlashClient`.

---

## v1.0.4 — Zero-Knowledge Security & Robust Hardening (Security Release)

A major security release addressing 21 critical, high, and medium-severity vulnerabilities.

### 🛡️ Network and Authentication Hardening

- **Local-First Default Host**: Changed default host binding for `FlashServer`, `FlashDashboard`, `FlashGRPCServer`, and `FlashReplicationServer` to `127.0.0.1` (localhost) instead of `0.0.0.0` (all interfaces) to prevent accidental public exposure.
- **Timing-Safe Credential Verification**: Replaced basic string comparison with a cryptographically secure `timingSafeCompare` using HMAC and constant-time equality checks for `authKey` in `FlashServer`, `FlashGRPCServer`, replication, and `FlashWebSocketServer`, as well as `token` in `FlashDashboard`.
- **CORS Protection**: Hardened CORS validation in `FlashServer` and `FlashDashboard` to restrict access strictly to trusted local origins (e.g., `localhost`, `127.0.0.1`), blocking wildcards `*` or untrusted cross-origin requests.
- **WebSocket CSWSH Defense**: Implemented strict `Origin` header validation in upgrade requests to protect against Cross-Site WebSocket Hijacking (CSWSH).
- **DoS Payload Capping**: Enforced a strict **10MB limit** on raw HTTP request bodies (`readBody`) in `FlashServer` and `FlashDashboard` and frame-level `maxPayload` buffers in `FlashWebSocketServer` to prevent memory-exhaustion Denial of Service (DoS) attacks.

### 🔐 Cryptographic Robustness & Zero-Knowledge Gaps

- **Authentic Post-Quantum Cryptography (PQC)**: Replaced the mock SHA3-based lattice key exchange in `FlashPQC` with real, production-ready ECDH (`secp256k1`) with SHA3-256 final shared secret encapsulation/decapsulation.
- **Hardened Key Expansion & PBKDF2**: Enforced PBKDF2-HMAC-SHA256 key expansion for any passphrase master key of any length in `FlashCipher`, completely avoiding the bypass where 32-character keys were used directly.
- **Dynamic Database Salts**: Replaced the static, hardcoded default salt (`flash_db_default_salt_2026`) with a cryptographically secure dynamic salt (`crypto.randomBytes(32)`) generated per-database and stored locally in a secure `.flash-salt` file.
- **Nonce Reuse & Deterministic Encryption**: Upgraded deterministic encryption in `FlashCipher` to use **AES-256-CBC** with HMAC-SHA256-derived IVs (derived from both key and plaintext) to eliminate the risk of GCM nonce-reuse and decryption tag collision.

### 🛡️ Logic Flows & Input Sanitization

- **Path Traversal & Zip Slip Prevention**: Enhanced `portable_bundle` extraction in `FlashPortableBundle` by resolving paths with `path.resolve` and enforcing strict boundary checks to prevent directory traversal / Zip Slip attacks.
- **Regex Query Sandboxing (ReDoS Protection)**: Wrapped all `$regex` evaluations in a secure `node:vm` sandbox with an absolute execution timeout of **50ms** to completely block Regular Expression Denial of Service (ReDoS) CPU exhaustion.
- **AI Prompt Firewall Injection Filters**: Upgraded `FlashPromptFirewall` to scan and redact prompt injection payloads (e.g., system instructions bypass) alongside PII patterns to secure local LLM agent workloads.
- **Safer Resource Lifecycle Management**: Updated `FlashCollection.close()` to close WAL and oplog file descriptors conditionally and gracefully. Resolved macOS directory deletion locks with a retry mechanism under transient `ENOTEMPTY` conditions.

## v1.0.3 — Companion foundation (honest config)

- `trash` and `deletionLog` on the `FlashClient` **root throw**. They only work under `engineOptions`.
- The same guard reads **FlashClient**, **FlashDatabase**, **FlashServer**, and `engineOptions` values (types, enums, nested keys).
- `listTrash` / `listDeletions` / `purge*` **throw** when the feature is disabled — they no longer return `[]`.
- `FlashClient.uri` rejects foreign database URLs (FLASH `flash://` / HTTP only).
- Config guard on FlashClient, FlashDatabase, FlashServer, and `engineOptions`.

---

## v1.0.2 — Optional deletion log + trash purge on drop

- **`engineOptions.deletionLog`** — opt-in permanent metadata-only activity log (`.flash-deletion-log`, sealed + compressed); disabled by default.
- **`listDeletions()` / `purgeDeletionLog()`** on client and collection.
- **`dropCollection(name)`** now purges trash entries for that collection.

See [Trash & Restore — Deletion activity log](/guide/trash-restore#deletion-activity-log-optional-permanent).

---

## v1.0.1 — Trash & Restore (undo delete)

Every `deleteOne` / `deleteMany` archives the document into a **single compressed `.flash-trash` file** before hard delete. Restore without a full backup:

```bash
npm install flash-zk
```

```js
await col.deleteOne({ _id: "n1" });
await col.restoreOne("n1");
await col.listTrash();
```

Configure limits via `engineOptions.trash` (`maxEntries`, `maxBytes`, `maxAgeMs`). See [Trash & Restore](/guide/trash-restore).

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
