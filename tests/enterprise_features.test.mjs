import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  FlashHNSWIndex,
  FlashVectorIndex,
  FlashMVCC,
  FlashSession,
  FlashCluster,
  FlashDistributedTxCoordinator,
  FlashKeyRotationManager,
  FlashORE,
  FlashCompactor,
  FlashMetrics,
  FlashETL,
  FlashDatabase,
  FlashCollection,
  FlashClient
} from '../src/index.mjs';

test('Enterprise Feature 1: FlashHNSWIndex - Fast O(log N) Graph Vector Search', async () => {
  const hnsw = new FlashHNSWIndex({ M: 8, efConstruction: 32, efSearch: 16 });

  // Generate 50 high-dimensional vectors
  for (let i = 0; i < 50; i++) {
    const vec = new Float32Array([i * 0.1, (50 - i) * 0.1, i % 5]);
    hnsw.insert(`doc_${i}`, vec);
  }

  assert.equal(hnsw.size(), 50);

  // Search nearest to doc_10
  const query = new Float32Array([10 * 0.1, 40 * 0.1, 0]);
  const results = hnsw.search(query, 5);

  assert.ok(results.length > 0);
  assert.equal(results[0].docId, 'doc_10');
  assert.ok(results[0].score >= 0.99);

  // Integrated FlashVectorIndex with HNSW engine
  const vIndex = new FlashVectorIndex({ engine: 'hnsw' });
  vIndex.set('v1', [1, 0, 0]);
  vIndex.set('v2', [0, 1, 0]);
  vIndex.set('v3', [0.9, 0.1, 0]);

  const vResults = vIndex.search([1, 0, 0], 2);
  assert.equal(vResults[0].docId, 'v1');
});

test('Enterprise Feature 2: FlashMVCC - Multi-Version Concurrency Control & Snapshot Isolation', async () => {
  const mvcc = new FlashMVCC();

  // Transaction 1 writes doc1
  const t1 = mvcc.beginTransaction('tx1');
  mvcc.write(t1.txId, 'doc1', { name: 'Alice', balance: 100 });
  mvcc.commit(t1.txId);

  // Transaction 2 starts (Snapshot 1)
  const t2 = mvcc.beginTransaction('tx2');
  const docBefore = mvcc.read(t2.txId, 'doc1');
  assert.equal(docBefore.balance, 100);

  // Transaction 3 modifies doc1 and commits
  const t3 = mvcc.beginTransaction('tx3');
  mvcc.write(t3.txId, 'doc1', { name: 'Alice', balance: 200 });
  mvcc.commit(t3.txId);

  // Transaction 2 still reads Snapshot version (balance = 100) -> Snapshot Isolation!
  const docSnapshot = mvcc.read(t2.txId, 'doc1');
  assert.equal(docSnapshot.balance, 100);

  // If Transaction 2 attempts to write to doc1, it should detect Write-Write conflict and abort
  mvcc.write(t2.txId, 'doc1', { name: 'Alice', balance: 150 });
  assert.throws(() => {
    mvcc.commit(t2.txId);
  }, /Write-Write conflict/);
});

test('Enterprise Feature 3: Distributed 2-Phase Commit (2PC) in FlashCluster', async () => {
  const tmpDir = path.join(os.tmpdir(), `flash_2pc_test_${Date.now()}`);
  const db1 = new FlashDatabase('shard1', { storagePath: path.join(tmpDir, 's1') });
  const db2 = new FlashDatabase('shard2', { storagePath: path.join(tmpDir, 's2') });

  const cluster = new FlashCluster();
  cluster.addShard('shard1', db1);
  cluster.addShard('shard2', db2);

  const coord = cluster.getTxCoordinator();
  const dtxId = coord.beginTransaction();

  // Stage writes on different keys routed across shards
  coord.stageOperation(dtxId, 'accounts', 'user_acc_A', 'insert', { doc: { _id: 'user_acc_A', balance: 500 } });
  coord.stageOperation(dtxId, 'accounts', 'user_acc_B', 'insert', { doc: { _id: 'user_acc_B', balance: 800 } });

  const result = await coord.commitTransaction(dtxId);
  assert.equal(result.success, true);
  assert.equal(result.state, 'COMMITTED');

  // Verify records were written to appropriate shards
  const shardA = cluster.getShardForKey('user_acc_A').db;
  const colA = shardA.collection('accounts');
  const foundA = await colA.findOne({ _id: 'user_acc_A' });
  assert.ok(foundA);
});

test('Enterprise Feature 4: FlashKeyRotationManager & FlashORE (Order-Revealing Encryption)', async () => {
  const masterKey = 'master_super_secret_kek_2026';
  const rotation = new FlashKeyRotationManager(masterKey);

  const encryptedV1 = rotation.encrypt('Confidential Medical Record #123');
  assert.ok(encryptedV1.startsWith('flash:v1:'));
  assert.equal(rotation.decrypt(encryptedV1), 'Confidential Medical Record #123');

  // Rotate Key to Version 2
  const rotRes = rotation.rotateKey();
  assert.equal(rotRes.newVersion, 2);

  const encryptedV2 = rotation.encrypt('Confidential Financial Record #456');
  assert.ok(encryptedV2.startsWith('flash:v2:'));

  // Decryption handles both v1 and v2 seamlessly
  assert.equal(rotation.decrypt(encryptedV1), 'Confidential Medical Record #123');
  assert.equal(rotation.decrypt(encryptedV2), 'Confidential Financial Record #456');

  // Check lazy migration detection
  assert.equal(rotation.needsReEncryption(encryptedV1), true);
  assert.equal(rotation.needsReEncryption(encryptedV2), false);

  // Test Order-Revealing Encryption (FlashORE)
  const ore = new FlashORE('ore_field_secret_key');
  const ore10 = ore.encrypt(10, 'salary');
  const ore25 = ore.encrypt(25, 'salary');
  const ore50 = ore.encrypt(50, 'salary');

  assert.equal(FlashORE.compare(ore10, ore25), -1);
  assert.equal(FlashORE.compare(ore50, ore25), 1);
  assert.equal(FlashORE.compare(ore25, ore25), 0);

  // Range evaluation on ciphertexts
  assert.equal(FlashORE.matchesRange(ore25, { $gt: ore10, $lt: ore50 }), true);
  assert.equal(FlashORE.matchesRange(ore10, { $gt: ore25 }), false);
});

test('Enterprise Feature 5: FlashCompactor - LSM-Tree SSTable Merge & Tombstone Eviction', async () => {
  const tmpDir = path.join(os.tmpdir(), `flash_compact_test_${Date.now()}`);
  const col = new FlashCollection('metrics', tmpDir, { memtableThreshold: 100 });
  await col.init();

  // Create multiple SSTables by writing and flushing
  await col.insertOne({ _id: 'm1', value: 100 });
  await col.flush();

  await col.insertOne({ _id: 'm2', value: 200 });
  await col.flush();

  await col.insertOne({ _id: 'm3', _deleted: true }); // Tombstone
  await col.flush();

  const filesBefore = (await fs.promises.readdir(col.storageDir)).filter(f => f.endsWith('.sst'));
  assert.ok(filesBefore.length >= 2);

  // Trigger Compaction
  const compactRes = await col.compact();
  assert.equal(compactRes.compacted, true);

  const filesAfter = (await fs.promises.readdir(col.storageDir)).filter(f => f.endsWith('.sst'));
  assert.equal(filesAfter.length, 1); // Consolidated into 1 level-1 SSTable!

  // Check active surviving records
  const m1 = await col.findOne({ _id: 'm1' });
  assert.ok(m1);
});

test('Enterprise Feature 6: FlashMetrics & FlashETL Data Pipeline Tools', async () => {
  const metrics = new FlashMetrics();
  metrics.recordOp('insert', 1.25);
  metrics.recordOp('find', 0.45);
  metrics.setGauge('memtable_bytes', 4096);

  const prom = metrics.toPrometheus();
  assert.ok(prom.includes('flash_uptime_seconds'));
  assert.ok(prom.includes('flash_operations_total{op="insert"} 1'));
  assert.ok(prom.includes('flash_memtable_bytes 4096'));

  // FlashETL test
  const tmpDir = path.join(os.tmpdir(), `flash_etl_test_${Date.now()}`);
  const col = new FlashCollection('products', tmpDir);
  await col.init();

  await col.insertMany([
    { _id: 'p1', name: 'MacBook Pro', price: 2499 },
    { _id: 'p2', name: 'iPhone 17', price: 1199 }
  ]);

  const ndjsonPath = path.join(tmpDir, 'export.ndjson');
  const exportRes = await FlashETL.exportToNDJSON(col, ndjsonPath);
  assert.equal(exportRes.exportedCount, 2);
  assert.ok(fs.existsSync(ndjsonPath));

  const csvPath = path.join(tmpDir, 'export.csv');
  const csvRes = await FlashETL.exportToCSV(col, csvPath, ['_id', 'name', 'price']);
  assert.equal(csvRes.exportedCount, 2);
  assert.ok(fs.existsSync(csvPath));

  // Import into new collection
  const colTarget = new FlashCollection('imported_products', tmpDir);
  const importRes = await FlashETL.importFromNDJSON(colTarget, ndjsonPath);
  assert.equal(importRes.importedCount, 2);
  assert.equal(await colTarget.count(), 2);
});
