# FlashCollection API Reference

The `FlashClientCollection` class provides a fluent document DB interface for executing encrypted operations, queries, aggregations, and more.

---

## Getting a Collection

```javascript
import { FlashClient } from 'flash-zk';

const client = new FlashClient({ secretKey: 'master-key' });

// Synchronous creation/access
const collection = client.collection('collection_name');

// With schema
const users = client.collection('users', {
  schema: {
    name: { type: 'string', required: true, trim: true },
    email: { type: 'string', required: true, unique: true }
  }
});
```

---

## Methods Summary

| Method | Returns | Description |
| :--- | :--- | :--- |
| `insertOne(doc)` | `Promise<{ insertedId, merkleRoot }>` | Insert and encrypt a single document. |
| `insertMany(docs)` | `Promise<{ insertedCount, insertedIds }>` | Batch insert multiple documents. |
| `find(filter?, options?)` | `FlashQuery<T>` | Fluent query builder with chaining. |
| `findOne(filter?)` | `Promise<T \| null>` | Return the first matching decrypted document. |
| `findById(id)` | `Promise<T \| null>` | Find by document `_id`. |
| `updateOne(filter, update, options?)` | `Promise<UpdateResult>` | Update one matching document. |
| `updateMany(filter, update, options?)` | `Promise<UpdateResult>` | Update all matching documents. |
| `findOneAndUpdate(filter, update, options?)` | `Promise<T \| null>` | Find and return updated document. |
| `findByIdAndUpdate(id, update, options?)` | `Promise<T \| null>` | Find by ID, update, and return. |
| `deleteOne(filter)` | `Promise<{ deletedCount }>` | Delete the first matching document. |
| `deleteMany(filter)` | `Promise<DeleteResult>` | Delete all matching documents. |
| `bulkWrite(operations, options?)` | `Promise<BulkWriteResult>` | Execute batch operations in one call. |
| `aggregate(pipeline)` | `Promise<object[]>` | Run aggregation pipeline. |
| `count(filter?)` | `Promise<number>` | Count documents. |
| `createIndex(keySpec, options?)` | `string` | Create a secondary index. |
| `listIndexes()` | `IndexInfo[]` | List all indexes. |
| `dropIndex(name)` | `boolean` | Drop an index. |
| `watch(filter?)` | `FlashChangeStream` | Watch for real-time change events. |
| `vectorSearch(params)` | `Promise<(T & { _score: number })[]>` | Semantic vector search. |
| `verifyRecordIntegrity(docId)` | `Promise<MerkleProofResult>` | Validate Merkle proof. |
| `setSchema(schema, options?)` | `this` | Set or update collection schema. |
| `ask(prompt, options?)` | `Promise<(T & { _interpretedQuery? })[]>` | Natural language query. |
| `timeSeriesBucket(...)` | `Promise<object[]>` | Time-series bucketing. |
| `spatialNear(field, nearSpec)` | `Promise<object[]>` | Geospatial nearest-neighbor query. |
| `paginate(filter?, opts?)` | `Promise<FlashPaginationResult<T>>` | Cursor-based pagination. |

### Low-level engine access (`collection.raw`)

`FlashClientCollection.raw` is a **`FlashCollection`**. Since v1.3.2 it stores and returns **buffers**:

```javascript
const raw = collection.raw;
await raw.insertOne(client.encryptToBuffer({ _id: '1', name: 'Ada' }));

const buffers = await raw.find({});
const doc = client.decryptFromBuffer(buffers[0]);
```

See [Buffer Pipeline](/guide/buffer-pipeline).

---

## Detailed Methods

### `insertOne(doc)`

Encrypts fields with `AES-256-GCM` (with AAD binding), generates HMAC Blind Index trapdoors, appends WAL frame, updates MemTable, and recalculates Merkle root.

```js
const res = await collection.insertOne({
  title: 'Quantum Computing',
  views: 1540,
  published: true
});
// res => { insertedId: 'uuid-...', merkleRoot: '33465733...' }
```

### `insertMany(docs)`

```js
const res = await collection.insertMany([
  { title: 'Post A', views: 100 },
  { title: 'Post B', views: 200 }
]);
// res => { insertedCount: 2, insertedIds: ['...', '...'] }
```

### `find(filter, options)`

Returns a `FlashQuery` with fluent chaining for sorting, pagination, selection, and more:

```js
// All documents
const all = await collection.find();

// Fluent query with chaining
const results = await collection
  .find({ published: true })
  .sort({ views: -1 })
  .limit(10)
  .skip(5)
  .select({ title: 1, views: 1 })
  .lean();

// Field-level operators
const filtered = await collection.find({
  views: { $gte: 100, $lte: 500 },
  status: { $in: ['active', 'published'] }
});
```

**Supported filter operators:** `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$regex`, `$ne`, `$exists`, `$and`, `$or`, `$not`, `$nor`, `$elemMatch`, `$size`, `$all`, `$type`, `$mod`.

### `updateOne(filter, update, options?)`

```js
const result = await collection.updateOne(
  { email: 'alice@example.com' },
  { $set: { name: 'Alice Updated' }, $inc: { loginCount: 1 } }
);
// result => { matchedCount: 1, modifiedCount: 1 }

// Upsert
await collection.updateOne(
  { email: 'new@example.com' },
  { $setOnInsert: { name: 'New User', createdAt: new Date() } },
  { upsert: true }
);
```

**Update operators:** `$set`, `$unset`, `$inc`, `$mul`, `$min`, `$max`, `$push`, `$pull`, `$addToSet`, `$pop`, `$currentDate`, `$setOnInsert`.

### `updateMany(filter, update, options?)`

```js
const result = await collection.updateMany(
  { status: 'draft' },
  { $set: { status: 'published' }, $inc: { version: 1 } }
);
```

### `findOneAndUpdate(filter, update, options?)`

```js
const doc = await collection.findOneAndUpdate(
  { email: 'alice@example.com' },
  { $inc: { loginCount: 1 } },
  { new: true }  // return the updated document
);
```

### `bulkWrite(operations, options?)`

Execute multiple operations in a single call:

```js
const result = await collection.bulkWrite([
  { insertOne: { document: { name: 'Alice', email: 'alice@x.com' } } },
  { updateOne: { filter: { email: 'bob@x.com' }, update: { $set: { active: true } } } },
  { deleteMany: { filter: { status: 'archived' } } }
], { ordered: false });
```

### `aggregate(pipeline)`

```js
const summary = await collection.aggregate([
  { $match: { views: { $gte: 100 } } },
  {
    $group: {
      _id: '$published',
      totalViews: { $sum: '$views' },
      avgViews: { $avg: '$views' },
      articleCount: { $count: 1 }
    }
  },
  { $sort: { totalViews: -1 } },
  { $limit: 10 }
]);
```

**Supported stages:** `$match`, `$group`, `$sort`, `$limit`, `$skip`, `$project`, `$addFields`, `$unwind`, `$lookup`, `$count`, `$unwind`, `$replaceRoot`, `$sample`, `$set`, `$out`, `$geoNear`, `$graphLookup`.

### `vectorSearch(params)`

Perform semantic vector search using HNSW index:

```js
const similar = await collection.vectorSearch({
  vector: [0.1, 0.2, 0.3, ...],  // query embedding
  topK: 5,
  filter: { category: 'tech' }   // optional metadata filter
});
// Returns: [{ _id: '...', _score: 0.95, title: '...', ... }, ...]
```

### `ask(prompt, options?)`

Natural language query using the AI query engine:

```js
const results = await collection.ask(
  'show me users who signed up in the last week and have more than 100 points',
  { limit: 20 }
);
```

### `watch(filter?)`

Watch for real-time change events:

```js
const stream = collection.watch({ status: 'completed' });
stream.on('change', (event) => {
  console.log(event.operationType, event.doc);
});
```

### `setSchema(schema, options?)`

Set or update collection schema with optional TTL:

```js
collection.setSchema({
  name: { type: 'string', required: true },
  email: { type: 'string', required: true, unique: true }
}, { expireAfterSeconds: 86400, ttlField: 'createdAt' });
```

### `verifyRecordIntegrity(docId)`

Validates cryptographic Merkle Tree proof:

```js
const result = await collection.verifyRecordIntegrity('doc_uuid');
if (result.isValid) {
  console.log('Record is authentic and untampered!');
}
```

### `createIndex(keySpec, options?)`

```js
collection.createIndex({ email: 1 }, { unique: true });
collection.createIndex({ createdAt: -1 });
```

### `listIndexes()`

```js
const indexes = collection.listIndexes();
// [{ name: 'email_1', spec: { email: 1 }, unique: true }, ...]
```
