# FlashClient SDK Reference

The `FlashClient` class is the primary entry point for developers. It handles client-side key derivation, encryption, trapdoor compilation, streaming aggregations, backup/restore, multi-tenancy, and AAD (Additional Authenticated Data) field binding.

---

## Constructor

```javascript
import { FlashClient } from 'flash-db';

const client = new FlashClient(options);
```

### Options

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `secretKey` | `string \| Buffer` | **Yes** | — | 32-byte secret key or passphrase for AES/HMAC encryption. |
| `dbName` | `string` | No | `'flash_db'` | Database cluster name. |
| `storagePath` | `string` | No | `'./data'` | Directory path for persistent WAL and SSTables. |
| `uri` | `string` | No | — | Flash Server URI (e.g., `flash://localhost:6742`). |
| `authKey` | `string` | No | — | Authentication key for Flash Server connections. |
| `pqcHardened` | `boolean` | No | `false` | Enable post-quantum hardened key derivation. |
| `autoTimestamps` | `boolean` | No | `true` | Auto-set `createdAt` / `updatedAt` on insert/update. |
| `engineOptions` | `FlashEngineOptions` | No | `{ durability: 'balanced' }` | Memtable, WAL sync, worker flush tuning. |
| `fieldPolicy` | `Record<string, FieldPolicyType>` | No | `{}` | Custom per-field encryption policy mappings. |

---

## Field Policy Types

```javascript
const client = new FlashClient({
  secretKey: 'master-key',
  fieldPolicy: {
    email: 'searchable',     // Default: AES-256-GCM + Blind Exact/Ngram trapdoors
    balance: 'counter',       // Additive homomorphic encryption ($sum/$inc)
    status: 'plaintext',      // Unencrypted fast-path metadata
    ssn: 'zk-secret'          // Pure randomized encryption without indexes
  }
});
```

---

## Methods

### `collection(name, options?)`

Initializes or opens a collection wrapper. Supports optional schema definition.

- **Parameters:**
  - `name: string` — collection name
  - `options?: { schema?: SchemaDefinition | FlashSchema }` — optional schema
- **Returns:** `FlashClientCollection<T>`

```javascript
const users = client.collection('users', {
  schema: {
    name: { type: 'string', required: true, trim: true },
    email: { type: 'string', required: true, unique: true }
  }
});
```

### `model(name, schema?)`

Create an ODM model for a collection.

- **Returns:** `FlashModelInterface<T>`

```javascript
const User = client.model('users', {
  name: { type: 'string', required: true },
  email: { type: 'string', required: true, unique: true }
});

await User.create({ name: 'Alice', email: 'alice@example.com' });
const user = await User.findOne({ email: 'alice@example.com' });
```

### `tenant(tenantId)`

Create a tenant-scoped client for multi-tenant isolation. Tenant key is derived as `HMAC-SHA256(masterKey, dbName + tenantId + version)`.

- **Parameters:**
  - `tenantId: string`
- **Returns:** `FlashClient`

```javascript
const tenantClient = client.tenant('org-123');
const collection = tenantClient.collection('users');
// All data is encrypted with a tenant-specific key
```

### `startSession()`

Start a new transaction session with ACID guarantees.

- **Returns:** `FlashSession`

```javascript
const session = client.startSession();
session.startTransaction();
try {
  await users.insertOne({ name: 'Alice' });
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
}
```

### `backup(destinationPath)`

Create a backup of all collections.

- **Parameters:**
  - `destinationPath: string`
- **Returns:** `Promise<BackupResult>`

```javascript
const result = await client.backup('/backups/flash-2024-01-15');
console.log(result);
// { bytesWritten: 1048576, files: ['users.sst', 'orders.sst'], timestamp: '2024-01-15T10:00:00Z' }
```

### `restore(backupPath)`

Restore from a backup.

- **Parameters:**
  - `backupPath: string`
- **Returns:** `Promise<RestoreResult>`

```javascript
const result = await client.restore('/backups/flash-2024-01-15');
console.log(result);
// { filesRestored: 2, destinationPath: './data' }
```

### `listCollections()`

List all collection names in the database.

- **Returns:** `Promise<string[]>`

```javascript
const names = await client.listCollections();
// ['users', 'orders', 'products']
```

### `encryptDocument(doc)`

Encrypt a document with AAD binding (uses record `_id` as AAD). Returns an `EncryptedDocument`.

- **Returns:** `EncryptedDocument`

```javascript
const encrypted = client.encryptDocument({ _id: 'doc-1', name: 'Alice', email: 'alice@example.com' });
// { _id: 'doc-1', _enc: { name: '...', email: '...' }, _blind: {...}, _homo: {...}, _plain: {...} }
```

### `decryptDocument(encryptedRecord)`

Decrypt an `EncryptedDocument` or **FlashBinary `Buffer`** back to plaintext.

- **Parameters:** `EncryptedDocument | Buffer`
- **Returns:** `Record<string, unknown>`

```javascript
const doc = client.decryptDocument(encrypted);
// or
const doc = client.decryptDocument(bufferFromEngine);
```

### `encryptToBuffer(doc)` · `decryptFromBuffer(buf)` *(v1.3.2+)*

Default performance path — encrypt/serialize once on write, partial decode on read.

```javascript
const buf = client.encryptToBuffer({ name: 'Alice', email: 'a@b.com' });
await col.raw.insertOne(buf);

const raw = await col.raw.findOne({ _id: '...' });
const plain = client.decryptFromBuffer(raw);
```

See [Buffer Pipeline](/guide/buffer-pipeline).

### `buildQueryEnvelope(query?)`

Build a query envelope for encrypted queries.

- **Returns:** `QueryEnvelope`

```javascript
const envelope = client.buildQueryEnvelope({ status: 'active' });
// { $plain: { status: 'active' } } or { $exact: { status: '...' } } if blind-indexed
```

### `openDashboard(options?)`

Open the Flash Dashboard GUI server.

- **Parameters:**
  - `options?: { port?: number }`
- **Returns:** Dashboard server instance

```javascript
client.openDashboard({ port: 6742 });
// Dashboard available at http://localhost:6742
```

### `close()`

Gracefully closes WAL file handles and flushes open collections.

- **Returns:** `Promise<void>`

```javascript
await client.close();
```

---

## Universal Foundations *(v1.3.0+)*

| Method | Returns | Description |
|--------|---------|-------------|
| `lifecycle(name, opts?)` | `FlashLifecycle` | TTL, max docs, archive |
| `maintenance(opts?)` | `FlashMaintenance` | Background flush/compact/sweep |
| `pipeline()` | `FlashPipeline` | NDJSON / collection ETL |
| `events()` | `FlashEventHub` | Pub/sub on mutations |
| `use(plugin)` | `FlashPluginHost` | `beforeInsert`, `beforeUpdate`, `afterInsert`, `afterUpdate` |
| `eventLog(name, opts?)` | `FlashEventLog` | Append-only stream |
| `counter(name, opts?)` | `FlashCounter` | Atomic counter |
| `queue(name, opts?)` | `FlashQueue` | FIFO job queue |
| `health()` | `Promise<object>` | Engine stats |
| `snapshot()` | `FlashSnapshot` | `.flashpack` backup |

Full guide: [Universal Foundations](/guide/foundations) · [Release Notes](/guide/release-notes)

---

## FLASH-Exclusive Intelligence Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `privateRAG(name, opts?)` | `FlashPrivateRAG` | Encrypted RAG pipeline |
| `embeddingVault(name, opts?)` | `FlashEmbeddingVault` | Vectors on server, text client-side |
| `agentMemory(namespace, opts?)` | `FlashAgentMemory` | AI agent episodic memory |
| `sealedVault(name, opts?)` | `FlashSealedVault` | Passphrase vault + auto-lock |
| `integrityProof(collection, opts?)` | `Promise<Proof>` | Signed Merkle manifest |
| `portableBundle()` | `FlashPortableBundle` | `.flashpack` export/import |
| `langChainAdapter(opts?)` | `FlashLangChainAdapter` | AI framework adapter |
| `federatedQuery()` | `FlashFederatedQuery` | Multi-peer query merge |
| `multiAgentSync(namespace)` | `FlashMultiAgentSync` | Shared agent memory |
| `complianceExport()` | `FlashComplianceExport` | GDPR export/erase |
| `timeSeal(path?)` | `FlashTimeSeal` | Tamper-evident timestamps |
| `cloudSync(remoteDir)` | `FlashCloudSync` | Cloud folder sync |
| `encryptedCRDT(name, nodeId)` | `FlashEncryptedCRDT` | Encrypted CRDT sync |
| `browserVault()` | `FlashBrowserVault` | Browser encrypted KV |
| `auditStream(collection)` | `FlashAuditStream` | Change stream + audit chain |

See [FLASH-Exclusive Stack](/guide/flash-exclusive) for full documentation.

---

## AAD (Additional Authenticated Data) Field Binding

FLASH DB v2 encrypts each field with AAD bound to the **record `_id`** and **field key**, preventing ciphertext swapping between records.

### How It Works

1. **Encrypt:** Each field gets AAD = `recordId:fieldName`
2. **Format:** v2 payload prefixed with magic `0xF44C4532` + length bytes + nonce + ciphertext + auth tag
3. **Decrypt:** AAD is verified — if ciphertext was moved to a different record, decryption fails
4. **Legacy support:** v1 payloads (without prefix) decrypt transparently without AAD

```js
// AAD binding is automatic
const users = client.collection('users');
await users.insertOne({ _id: 'user-1', name: 'Alice' });

// Swapping ciphertext between records fails
// The ciphertext for user-1's name won't decrypt in user-2's context
```

### Migrating from v1

v1 payloads are detected by the absence of the v2 magic prefix and decrypted without AAD verification. Existing data continues to work — no migration required.
