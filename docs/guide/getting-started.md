# Getting Started with FLASH DB

**FLASH** is a zero-knowledge encrypted intelligence database — server-blind by architecture, local-first by default, and built for private AI workloads.

It is **not** a generic document store with encryption added later. Every layer — storage (`.farc`, `FlashBinary`), indexing (blind trapdoors, ORE), and query — assumes the engine never sees plaintext.

> New here? Read [Positioning](/guide/positioning), [Release Notes](/guide/release-notes), and [Why Server-Blind AI Storage](/guide/why-server-blind-ai).

---

## Intelligence in 5 Minutes

The fastest path to FLASH's identity — **Private RAG → Agent Memory → Sealed Vault**:

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: "my_super_secret_master_passphrase_2026",
  storagePath: "./flash_data",
});

// 1. Private RAG — ingest & ask (server-blind)
const rag = client.privateRAG("knowledge");
await rag.ingest({
  title: "Security Policy",
  text: "All data is encrypted client-side...",
});
const ctx = await rag.ask("How is data protected?");
console.log(ctx.sources[0]?.text);

// 2. Agent Memory — encrypted episodic recall
const memory = client.agentMemory("assistant");
await memory.remember("User prefers dark mode", { importance: 2 });
const facts = await memory.recall("UI preferences");

// 3. Sealed Vault — passphrase-isolated secrets
const vault = client.sealedVault("secrets");
vault.unlock("my-passphrase");
await vault.put("api_key", { service: "openai", value: "sk-..." });

await client.close();
```

**CLI equivalent:**

```bash
flashsh init                          # bootstrap local intelligence workspace
flashsh ingest ./notes.txt            # add to private RAG
flashsh ask "what did I ingest?"      # semantic retrieval
```

**Web UI:** `npx flash-console` → [Intelligence Console](/guide/intelligence-console)

---

## Engine Options (v1.2.5+)

```javascript
const client = new FlashClient({
  secretKey: "key",
  engineOptions: {
    durability: "balanced", // strict | balanced | throughput
    memtableThreshold: 4 * 1024 * 1024,
  },
});
```

See [Engine Options & Durability](/guide/engine-options).

---

## 📦 Installation

Install the library directly into your project:

```bash
npm install flash-zk
```

Ensure your `package.json` specifies `"type": "module"`.

---

## 🚀 Quick Setup

### 1. Initialize the Client

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: "my_super_secret_master_passphrase_2026", // Master 256-bit encryption key
  dbName: "production_db", // Database namespace
  storagePath: "./flash_data", // Storage directory for WAL & SSTables
});
```

### 2. Access Collections (Synchronous Interface)

Collections are instantiated synchronously and initialized on-demand:

```javascript
const users = client.collection("users");
const orders = client.collection("orders");
```

---

## 📖 Complete CRUD Guide

### ➕ 1. Inserting Documents

#### A. Insert a Single Document (`insertOne`)

```javascript
const insertResult = await users.insertOne({
  name: "Alan Turing",
  email: "alan@bletchley.gov.uk",
  age: 41,
  balance: 12000,
  department: "Cryptography",
  status: "active",
});

console.log("Inserted ID:", insertResult.insertedId);
console.log("Merkle State Root:", insertResult.merkleRoot);
```

#### B. Insert Multiple Documents in Batch (`insertMany`)

```javascript
const batchResult = await users.insertMany([
  {
    name: "Grace Hopper",
    email: "grace@navy.mil",
    age: 85,
    balance: 35000,
    department: "Compilers",
  },
  {
    name: "Claude Shannon",
    email: "claude@bell-labs.com",
    age: 84,
    balance: 28000,
    department: "Information Theory",
  },
  {
    name: "Ada Lovelace",
    email: "ada@analytical.org",
    age: 36,
    balance: 42000,
    department: "Mathematics",
  },
]);

console.log("Inserted Count:", batchResult.insertedCount);
console.log("Inserted IDs:", batchResult.insertedIds);
```

---

### 🔍 2. Querying & Finding Documents

#### A. Find All Documents (`find()`)

To fetch all documents in the collection:

```javascript
const allUsers = await users.find();
// Or explicitly:
const allUsers = await users.find({});
console.log(allUsers);
```

#### B. Find Single Document (`findOne`)

```javascript
const user = await users.findOne({ email: "alan@bletchley.gov.uk" });
console.log(user.name); // 'Alan Turing'
```

#### C. Exact Matching over Encrypted Blind Indexes (`$eq` / Direct)

```javascript
// Matches are found via HMAC trapdoors without server decryption
const admins = await users.find({ department: "Cryptography" });
```

#### D. Substring & Regex Queries (`$regex`)

```javascript
// Searches using 3-Gram trapdoors with Honey Padding protection
const results = await users.find({ name: { $regex: "Grace" } });
```

#### E. Range Comparisons (`$gt`, `$gte`, `$lt`, `$lte`)

```javascript
// Searches using discrete bucketed range tokens
const seniors = await users.find({ age: { $gte: 40, $lte: 90 } });
```

#### F. Pagination (`limit` and `skip`)

```javascript
const page1 = await users.find({}, { limit: 10, skip: 0 });
const page2 = await users.find({}, { limit: 10, skip: 10 });
```

---

### 🗑️ 3. Deleting Documents (`deleteOne`)

Removes the document from memory and active indexes, appends a tombstone frame to the WAL, and recalculates the Merkle root:

```javascript
const deleteResult = await users.deleteOne({ email: "alan@bletchley.gov.uk" });
console.log("Deleted Count:", deleteResult.deletedCount); // 1
```

---

### 📊 4. Document Count (`count`)

Returns the exact count of active, non-tombstone records:

```javascript
const totalCount = await users.count();
console.log("Active Documents:", totalCount);
```

---

### 🧮 5. Stream Aggregation Pipelines (`aggregate`)

Execute multi-stage analytics pipelines with client-side streaming:

```javascript
const report = await users.aggregate([
  // Stage 1: Filter by condition
  { $match: { age: { $gte: 30 } } },

  // Stage 2: Group and compute metrics
  {
    $group: {
      _id: "$department",
      totalPayroll: { $sum: "$balance" },
      avgAge: { $avg: "$age" },
      headCount: { $count: 1 },
    },
  },

  // Stage 3: Sort results
  { $sort: { totalPayroll: -1 } },

  // Stage 4: Limit results
  { $limit: 5 },
]);

console.log(report);
```

---

### 🔗 6. Relationships & Foreign Key Joins (`$lookup` & `populate`)

FLASH DB supports full relationship resolution between collections via either **Aggregation `$lookup`** or **Direct `populate` in `find()`**:

#### A. Direct `populate` in `find()` (Easiest)

```javascript
// Fetch user and automatically populate all matching posts from 'posts' collection
const usersWithPosts = await users.find(
  { email: "alan@bletchley.gov.uk" },
  {
    populate: [
      {
        from: "posts", // Target foreign collection
        localField: "_id", // Field in users
        foreignField: "authorId", // FK field in posts
        as: "articles", // Attached field name
      },
    ],
  },
);

console.log(usersWithPosts[0].articles); // Array of decrypted posts!
```

#### B. Pipeline `$lookup` in `aggregate()`

```javascript
const joinedReport = await users.aggregate([
  { $match: { department: "Cryptography" } },
  {
    $lookup: {
      from: "posts",
      localField: "_id",
      foreignField: "authorId",
      as: "posts",
    },
  },
]);
```

---

### 🌲 7. Cryptographic Merkle Proof Verification

Verify that a specific record has not been tampered with or corrupted on disk:

```javascript
const check = await users.verifyRecordIntegrity(insertResult.insertedId);

console.log("Integrity Valid:", check.isValid); // true
console.log("Merkle Root:", check.root); // SHA-256 hash
console.log("Proof Tree Depth:", check.proofLength); // Tree path length
```

---

### 💾 7. Manual SSTable Flush & Checkpointing

Force-flush all active MemTable entries to an immutable on-disk `.sst` segment:

```javascript
await users.raw.flush();
```

---

### 🗄️ 8. Database Management & Cleanup

```javascript
// List all collection names in the database
const collections = client.db.listCollections();
console.log(collections); // ['users', 'orders']

// Drop a collection and permanently erase its files
await client.db.dropCollection("temporary_data");

// Graceful database shutdown
await client.close();
```
