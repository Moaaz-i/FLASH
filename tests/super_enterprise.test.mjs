import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FlashAuditVault,
  FlashBlobStore,
  FlashBrowserAdapter,
  FlashCDC,
  FlashClient,
  FlashConnectionPool,
  FlashCostOptimizer,
  FlashDataMasker,
  FlashDatabase,
  FlashDeadlockDetector,
  FlashDistributedLock,
  FlashFaker,
  FlashFederation,
  FlashGraph,
  FlashGraphQL,
  FlashMVCC,
  FlashMigrator,
  FlashOnlineIndexer,
  FlashPubSub,
  FlashRBAC,
  FlashRaft,
  FlashRateLimiter,
  FlashSIMD,
  FlashSQL,
  FlashSearchEngine,
  FlashSemanticCache,
  FlashSpatialRTree,
  FlashTimeSeriesRollup,
  FlashTimeTravel,
  FlashLLMAdapter,
  FlashAIDatabase,
} from "../src/index.mjs";

test("1. FlashSemanticCache - Fast AI/LLM Response Caching", () => {
  const cache = new FlashSemanticCache({ similarityThreshold: 0.9 });
  const promptVec = [0.1, 0.5, 0.9];
  cache.set("What is zero-knowledge encryption?", promptVec, {
    answer: "Zero-knowledge proofs allow verification without revealing data.",
  });

  // Exact / High similarity match
  const hit = cache.get([0.1, 0.51, 0.89]);
  assert.ok(hit);
  assert.equal(hit.hit, true);
  assert.ok(hit.similarity >= 0.95);
  assert.ok(hit.response.answer.includes("Zero-knowledge"));

  // Low similarity should miss
  const miss = cache.get([-0.9, 0.1, 0.0]);
  assert.equal(miss, null);
});

test("2. FlashTimeTravel - Historical Point-In-Time Querying", () => {
  const mvcc = new FlashMVCC();
  const timeTravel = new FlashTimeTravel(mvcc);

  // Commit 1 at t=100
  const t1 = mvcc.beginTransaction("tx1");
  mvcc.write(t1.txId, "order_1", { status: "PENDING", amount: 150 });
  const c1 = mvcc.commit(t1.txId);
  timeTravel.recordCommit(c1.commitTs, 100);

  // Commit 2 at t=200
  const t2 = mvcc.beginTransaction("tx2");
  mvcc.write(t2.txId, "order_1", { status: "SHIPPED", amount: 150 });
  const c2 = mvcc.commit(t2.txId);
  timeTravel.recordCommit(c2.commitTs, 200);

  // Query as of t=150 (before it was shipped)
  const docAt150 = timeTravel.queryAsOf("order_1", 150);
  assert.equal(docAt150.status, "PENDING");

  // Query as of t=250
  const docAt250 = timeTravel.queryAsOf("order_1", 250);
  assert.equal(docAt250.status, "SHIPPED");
});

test("3. FlashSQL - SQL Query Parsing and Execution", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash_sql_test_"));
  const client = new FlashClient({
    secretKey: "sql_zk_client_key_32_chars!!!!",
    storagePath: tmpDir,
    autoTimestamps: false,
  });
  try {
    const col = client.collection("customers");
    await col.insertMany([
      { _id: "c1", name: "Alice", age: 30, score: 95 },
      { _id: "c2", name: "Bob", age: 20, score: 80 },
      { _id: "c3", name: "Charlie", age: 35, score: 90 },
    ]);

    const results = await FlashSQL.execute(
      client,
      "SELECT name, score FROM customers WHERE age >= 25 ORDER BY score DESC LIMIT 2",
    );

    assert.equal(results.length, 2);
    assert.equal(results[0].name, "Alice");
    assert.equal(results[1].name, "Charlie");
    assert.equal(results[0].age, undefined);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("4. FlashRaft - High-Availability Consensus Leader Election", () => {
  const node1 = new FlashRaft("node1", ["node2", "node3"]);
  const election = node1.startElection();
  assert.equal(election.elected, true);
  assert.equal(node1.state, "LEADER");

  const rep = node1.replicate({ op: "SET", key: "k1", val: "v1" });
  assert.equal(rep.committed, true);
});

test("5. FlashGraphQL - Lightweight GraphQL Querying", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash_gql_test_"));
  const client = new FlashClient({
    secretKey: "gql_zk_client_key_32_chars!!!!",
    storagePath: tmpDir,
    autoTimestamps: false,
  });
  try {
    const col = client.collection("users");
    await col.insertMany([
      { _id: "u1", username: "alex", email: "alex@io", role: "admin" },
      { _id: "u2", username: "bob", email: "bob@io", role: "viewer" },
    ]);

    const gql = new FlashGraphQL(client);
    const res = await gql.execute("{ users(limit: 1) { username email } }");
    assert.ok(res.data.users);
    assert.equal(res.data.users.length, 1);
    assert.equal(res.data.users[0].username, "alex");
    assert.equal(res.data.users[0].role, undefined);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("6. FlashBrowserAdapter - Local-First Storage Adapter", async () => {
  const adapter = new FlashBrowserAdapter("offline_app");
  await adapter.set("notes", "note_1", Buffer.from("Offline encrypted note"));
  const buf = await adapter.get("notes", "note_1");
  assert.equal(buf.toString(), "Offline encrypted note");
});

test("7. FlashSIMD & FlashSearchEngine - Vector Math & BM25 Full-Text", () => {
  // SIMD Math
  const a = new Float32Array([1, 2, 3, 4, 5]);
  const b = new Float32Array([1, 2, 3, 4, 5]);
  const sim = FlashSIMD.cosineSimilarity(a, b);
  assert.ok(Math.abs(sim - 1.0) < 0.0001);

  // BM25 Full-Text Search
  const search = new FlashSearchEngine();
  search.indexDocument("doc1", "Quantum computing algorithms and cryptography");
  search.indexDocument("doc2", "Cooking organic pasta recipes");

  const results = search.search("quantum cryptography", 5);
  assert.equal(results[0].docId, "doc1");
});

test("8. FlashDeadlockDetector - Graph Wait-For Analysis", () => {
  const dd = new FlashDeadlockDetector();
  dd.addDependency("tx1", "tx2");
  dd.addDependency("tx2", "tx3");
  const cycleCreated = dd.addDependency("tx3", "tx1"); // Cycle!
  assert.equal(cycleCreated, true);

  const cycle = dd.detectCycle();
  assert.ok(cycle.length >= 3);
});

test("9. FlashGraph - Nodes, Edges, and Dijkstra Path Traversal", () => {
  const graph = new FlashGraph();
  graph.addNode("A", "Person", { name: "Alice" });
  graph.addNode("B", "Person", { name: "Bob" });
  graph.addNode("C", "Person", { name: "Charlie" });

  graph.addEdge("A", "B", "FOLLOWS", 1);
  graph.addEdge("B", "C", "FOLLOWS", 2);
  graph.addEdge("A", "C", "FOLLOWS", 5);

  const shortest = graph.findShortestPath("A", "C");
  assert.deepEqual(shortest.path, ["A", "B", "C"]);
  assert.equal(shortest.distance, 3); // 1 + 2 < 5
});

test("10. FlashAuditVault - Cryptographic Compliance Chaining", () => {
  const vault = new FlashAuditVault("secure_audit_secret_2026");
  vault.log("admin_user", "KEY_ROTATION", "master_key");
  vault.log("service_api", "READ", "medical_record_123");

  const check = vault.verifyChain();
  assert.equal(check.valid, true);
  assert.equal(check.totalEntries, 2);
});

test("11. FlashSpatialRTree - Geospatial Bounding Box & Haversine", () => {
  const rtree = new FlashSpatialRTree();
  // New York City
  rtree.insertPoint("nyc", 40.7128, -74.006, { name: "New York" });
  // Philadelphia (~130km away)
  rtree.insertPoint("philly", 39.9526, -75.1652, { name: "Philadelphia" });
  // Tokyo
  rtree.insertPoint("tokyo", 35.6762, 139.6503, { name: "Tokyo" });

  const nearest = rtree.searchNearest(40.73, -73.99, 2);
  assert.equal(nearest[0].id, "nyc");
  assert.equal(nearest[1].id, "philly");
});

test("12. FlashPubSub - Message Queue Broker", () => {
  const pubsub = new FlashPubSub();
  let received = null;
  pubsub.subscribe("orders", "consumer_1", (msg, ack) => {
    received = msg.message;
    ack();
  });

  pubsub.publish("orders", { orderId: "ord_99", total: 499 });
  assert.deepEqual(received, { orderId: "ord_99", total: 499 });
});

test("13. FlashBlobStore - Chunked Large File Storage", () => {
  const blobStore = new FlashBlobStore({ chunkSizeBytes: 1024 });
  const data = Buffer.alloc(3000, "X"); // 3000 bytes => 3 chunks

  const res = blobStore.writeBlob("blob_1", "dataset.bin", data);
  assert.equal(res.totalChunks, 3);

  const readBack = blobStore.readBlob("blob_1");
  assert.equal(readBack.length, 3000);
});

test("14. FlashMigrator - Schema Migrations", async () => {
  const tmpDir = path.join(os.tmpdir(), `flash_mig_test_${Date.now()}`);
  const db = new FlashDatabase("mig_db", { storagePath: tmpDir });
  const mig = new FlashMigrator(db);

  mig.register(1, "create_users", async (d) => {
    const c = d.collection("users");
    await c.insertOne({ _id: "admin", role: "admin" });
  });

  const applied = await mig.up();
  assert.equal(applied.length, 1);
});

test("15. FlashConnectionPool, DataMasker & CostOptimizer", () => {
  // Pool
  const pool = new FlashConnectionPool([
    "http://node1:6742",
    "http://node2:6742",
  ]);
  const ep1 = pool.acquire();
  pool.release(ep1);
  assert.ok(ep1.includes(":6742"));

  // Data Masker
  const masked = FlashDataMasker.maskDocument(
    {
      name: "John Doe",
      email: "john.doe@company.com",
      card: "4111222233334444",
    },
    { email: "email", card: "card" },
  );
  assert.equal(masked.card, "****-****-****-4444");
  assert.ok(
    masked.email.includes("*") && masked.email.includes("@company.com"),
  );

  // Cost Optimizer
  const plan = FlashCostOptimizer.planQuery(
    { email: "test@io" },
    new Set(["email"]),
    5000,
  );
  assert.equal(plan.plan, "INDEX_SCAN");
});

test("16. FlashRateLimiter, TimeSeriesRollup, RBAC, DistributedLock & CDC", () => {
  // Rate Limiter
  const rl = new FlashRateLimiter({ capacity: 2, refillRatePerSec: 1 });
  assert.equal(rl.consume("client_ip").allowed, true);
  assert.equal(rl.consume("client_ip").allowed, true);
  assert.equal(rl.consume("client_ip").allowed, false);

  // TimeSeries Rollup
  const points = [
    { timestamp: 1000, value: 10 },
    { timestamp: 2000, value: 20 },
    { timestamp: 65000, value: 100 },
  ];
  const rolled = FlashTimeSeriesRollup.rollup(points, 60000);
  assert.equal(rolled.length, 2);
  assert.equal(rolled[0].avg, 15);

  // RBAC
  const rbac = new FlashRBAC();
  rbac.createRole("editor", ["articles:*"]);
  rbac.assignRole("user_123", "editor");
  assert.equal(rbac.can("user_123", "articles", "write"), true);
  assert.equal(rbac.can("user_123", "payments", "write"), false);

  // Distributed Lock
  const dlock = new FlashDistributedLock();
  const l1 = dlock.acquire("sync_job", "worker_A", 1000);
  assert.equal(l1.acquired, true);
  const l2 = dlock.acquire("sync_job", "worker_B", 1000);
  assert.equal(l2.acquired, false);
  dlock.release("sync_job", l1.leaseToken);

  // CDC
  const cdc = new FlashCDC();
  let cdcReceived = null;
  cdc.subscribe((evt) => {
    cdcReceived = evt;
  });
  cdc.recordChange("users", "INSERT", "u_1", { name: "Sam" });
  assert.ok(cdcReceived);
  assert.equal(cdcReceived.docId, "u_1");
});

test("17. FlashFederation, FlashFaker & FlashOnlineIndexer", async () => {
  // Faker
  const mockDocs = FlashFaker.generateBatch(5);
  assert.equal(mockDocs.length, 5);

  // Federation
  const tmpDir = path.join(os.tmpdir(), `flash_fed_test_${Date.now()}`);
  const db1 = new FlashDatabase("db1", { storagePath: path.join(tmpDir, "1") });
  const db2 = new FlashDatabase("db2", { storagePath: path.join(tmpDir, "2") });

  const c1 = db1.collection("items");
  const c2 = db2.collection("items");
  await c1.insertOne({ _id: "i1", name: "Item 1" });
  await c2.insertOne({ _id: "i2", name: "Item 2" });

  const fed = new FlashFederation();
  fed.registerMember("shard_1", db1);
  fed.registerMember("shard_2", db2);

  const fedResults = await fed.federatedFind("items");
  assert.equal(fedResults.length, 2);

  // Online Indexer
  const indRes = await FlashOnlineIndexer.buildIndexOnline(c1, "name");
  assert.equal(indRes.indexedCount, 1);
});

test("18. FlashLLMAdapter - Large Language Model Adapter Suite", async () => {
  const { FlashLLMAdapter } = await import("../src/index.mjs");
  const adapter = new FlashLLMAdapter({
    provider: "auto",
    model: "Xenova/Qwen1.5-0.5B-Chat",
  });

  const res = await adapter.generate(
    "Hello, explain database indexing in one sentence",
    { maxTokens: 25 },
  );
  assert.ok(typeof res.latencyMs === "string");
  assert.ok(typeof res.provider === "string");
});

test("19. FlashAIDatabase - Official AI & ChatGPT Sovereign Database Suite", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt_app_db_"));
  const aiDb = new FlashAIDatabase({
    name: "chatgpt_app_db",
    storagePath: tmpDir,
    dimensions: 64,
    similarityThreshold: 0.85,
  });

  // 1. Cached Prompt & Token Saving
  let llmCalls = 0;
  const mockLLM = async (prompt) => {
    llmCalls++;
    return `Response for: ${prompt}`;
  };

  const r1 = await aiDb.cachedPrompt("ما هو تشفير ما بعد الكم؟", mockLLM);
  assert.equal(r1.cacheHit, false);
  assert.equal(llmCalls, 1);

  // Exact or semantically similar prompt -> Hits cache in < 0.2ms!
  const r2 = await aiDb.cachedPrompt("ما هو تشفير ما بعد الكم؟", mockLLM);
  assert.equal(r2.cacheHit, true);
  assert.equal(llmCalls, 1); // Mock LLM not called!
  assert.ok(r2.savedTokensEstimate > 0);

  // 2. Remember & Recall Knowledge Context (RAG)
  await aiDb.remember(
    "تشفير Kyber معتمد من NIST FIPS 203 للحماية ضد الحواسيب الكمية",
    { tag: "crypto" },
  );
  await aiDb.remember(
    "هيكل LSM-Tree يحول الكتابة العشوائية إلى تسلسلية فائقة السرعة",
    { tag: "storage" },
  );

  const context = await aiDb.recallContext("معيار NIST لتشفير الكم");
  assert.ok(context.length > 0);
  assert.ok(context[0].text.includes("Kyber"));

  // 3. Encrypted Chat Sessions (Zero-Knowledge)
  const sessionData = [
    { role: "user", content: "مرحباً يا بوت" },
    { role: "assistant", content: "أهلاً بك! كيف أساعدك اليوم؟" },
  ];
  await aiDb.saveChatSession("sess_user_99", sessionData);
  const retrieved = await aiDb.getChatHistory("sess_user_99");
  assert.equal(retrieved.length, 2);
  assert.equal(retrieved[0].content, "مرحباً يا بوت");

  // 4. Built-in Multi-Turn Generative Response
  const gen = await aiDb.generateResponse("كيف حالك يا جميل", {
    sessionId: "sess_user_99",
  });
  assert.ok(typeof gen.text === "string");
  assert.ok(gen.historyLength >= 2);

  // 5. Metrics & Analytics
  const metrics = aiDb.getMetrics();
  assert.equal(metrics.cacheHits, 1);
  assert.equal(metrics.totalQueries, 2);
  assert.equal(metrics.hitRate, "50.0%");
  assert.ok(metrics.savedTokensEstimate > 0);
});

test("20. FlashLLMAdapter & Ready-Made Large Language Model Integration", async () => {
  const { FlashLLMAdapter } = await import("../src/index.mjs");
  const adapter = new FlashLLMAdapter({
    provider: "auto",
    systemPrompt: "تحدث مع المستخدمين بكل لطف واحترام وركز على أمان البيانات",
  });

  // Test System Prompt Configuration
  assert.equal(
    adapter.systemPrompt,
    "تحدث مع المستخدمين بكل لطف واحترام وركز على أمان البيانات",
  );
  adapter.setSystemPrompt("You are a helpful coding assistant.");
  assert.equal(adapter.systemPrompt, "You are a helpful coding assistant.");

  // Test Unified Generation Pipeline
  const res = await adapter.generate("Hello world", { maxTokens: 20 });
  assert.ok(typeof res.latencyMs === "string");
  assert.ok(typeof res.provider === "string");

  // Test integration inside FlashAIDatabase.askLLM & system steering
  const aiDb = new FlashAIDatabase({
    name: "ready_made_llm_vault",
    systemPrompt: "أنت مهندس قواعد بيانات خبير",
  });
  assert.equal(aiDb.systemPrompt, "أنت مهندس قواعد بيانات خبير");
  const llmRes = await aiDb.askLLM("ما هي هندسة النظم؟");
  assert.ok(llmRes.latencyMs);
  assert.ok(llmRes.answer);
});
