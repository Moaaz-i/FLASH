import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  FlashClient,
  FlashSpatialPlugin,
  FlashTimeSeriesPlugin,
  FlashTextSearchPlugin,
  FlashCRDTSync
} from '../src/index.mjs';

test('Breakthrough Features - BulkWrite, Backup/Restore, Multi-Tenancy, Spatial, TimeSeries, BM25 & CRDT', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_breakthrough_test_${Date.now()}`);
  const backupDir = path.join(os.tmpdir(), `flash_backup_dest_${Date.now()}`);
  const restoreDir = path.join(os.tmpdir(), `flash_restore_dest_${Date.now()}`);

  const client = new FlashClient({
    secretKey: 'master_passphrase_breakthrough',
    storagePath: tmpDir
  });

  try {
    const orders = client.collection('orders');

    // 1. Test BulkWrite
    const bulkRes = await orders.bulkWrite([
      { insertOne: { document: { orderId: 101, total: 50, status: 'pending' } } },
      { insertOne: { document: { orderId: 102, total: 120, status: 'paid' } } },
      { updateOne: { filter: { orderId: 101 }, update: { $set: { status: 'shipped' } } } },
      { updateOne: { filter: { orderId: 103 }, update: { $set: { orderId: 103, total: 200, status: 'new' } }, upsert: true } }
    ]);

    assert.equal(bulkRes.insertedCount, 2);
    assert.equal(bulkRes.modifiedCount, 1);
    assert.equal(bulkRes.upsertedCount, 1);

    const allOrders = await orders.find().sort({ orderId: 1 });
    assert.equal(allOrders.length, 3);
    assert.equal(allOrders[0].status, 'shipped');

    // 2. Test Multi-Tenancy
    const tenantA = client.tenant('org_alpha');
    const tenantB = client.tenant('org_beta');

    await tenantA.collection('secrets').insertOne({ msg: 'Confidential Alpha' });
    await tenantB.collection('secrets').insertOne({ msg: 'Confidential Beta' });

    const alphaDocs = await tenantA.collection('secrets').find();
    const betaDocs = await tenantB.collection('secrets').find();

    assert.equal(alphaDocs.length, 1);
    assert.equal(alphaDocs[0].msg, 'Confidential Alpha');
    assert.equal(betaDocs.length, 1);
    assert.equal(betaDocs[0].msg, 'Confidential Beta');

    // 3. Test Physical Hot Backup & Restore
    const backupResult = await client.backup(backupDir);
    assert.ok(backupResult.bytesWritten > 0);

    const restoreResult = await client.restore(backupDir);
    assert.equal(restoreResult.success, true);

    // 4. Test GeoJSON 2DSphere Spatial Indexing
    const locations = [
      { name: 'Central Park', location: { type: 'Point', coordinates: [-73.9654, 40.7829] } },
      { name: 'Empire State Building', location: { type: 'Point', coordinates: [-73.9857, 40.7484] } },
      { name: 'Statue of Liberty', location: { type: 'Point', coordinates: [-74.0445, 40.6892] } }
    ];

    // Search near Times Square [-73.9851, 40.7589] within 5km (5000m)
    const nearby = FlashSpatialPlugin.filterNear(locations, 'location', {
      coordinates: [-73.9851, 40.7589],
      $maxDistance: 5000
    });

    assert.equal(nearby.length, 2);
    assert.equal(nearby[0].name, 'Empire State Building', 'Nearest point should rank first');
    assert.equal(nearby[1].name, 'Central Park');

    // 5. Test Time-Series Bucketing & Downsampling
    const sensorReadings = [
      { timestamp: '2026-08-15T10:01:00Z', temperature: 22.5, pressure: 1013 },
      { timestamp: '2026-08-15T10:02:00Z', temperature: 23.0, pressure: 1014 },
      { timestamp: '2026-08-15T10:06:00Z', temperature: 25.5, pressure: 1015 }
    ];

    const buckets = FlashTimeSeriesPlugin.bucket(sensorReadings, 'timestamp', '5m', {
      avgTemp: { $avg: 'temperature' },
      maxPressure: { $max: 'pressure' }
    });

    assert.equal(buckets.length, 2);
    assert.equal(buckets[0].count, 2);
    assert.equal(buckets[0].avgTemp, 22.75);
    assert.equal(buckets[0].maxPressure, 1014);

    // 6. Test BM25 Full-Text Search & Hybrid Fusion
    const textEngine = new FlashTextSearchPlugin();
    textEngine.indexDocument('doc_1', 'Zero Knowledge Cryptographic Database Engine');
    textEngine.indexDocument('doc_2', 'Relational SQL Database Management System');
    textEngine.indexDocument('doc_3', 'Vector Search AI Machine Learning Knowledge Base');

    const searchResults = textEngine.search('Cryptographic Database');
    assert.equal(searchResults.length, 2);
    assert.equal(searchResults[0].docId, 'doc_1');

    const hybrid = FlashTextSearchPlugin.reciprocalRankFusion(
      [{ docId: 'doc_1' }, { docId: 'doc_2' }],
      [{ docId: 'doc_1' }, { docId: 'doc_3' }]
    );
    assert.equal(hybrid[0].docId, 'doc_1', 'Document matching both lexical & vector ranks highest');

    // 7. Test CRDT Multi-Master Replication
    const nodeA = new FlashCRDTSync('node_A');
    const nodeB = new FlashCRDTSync('node_B');

    const deltaA = nodeA.setLocal('doc_100', { title: 'State from Node A', v: 1 });
    await new Promise(r => setTimeout(r, 10));
    const deltaB = nodeB.setLocal('doc_100', { title: 'State from Node B (Newer)', v: 2 });

    // Merge B into A
    const mergeRes = nodeA.mergeRemoteDelta(deltaB);
    assert.equal(mergeRes.applied, true);

    const activeA = nodeA.getActiveDocuments();
    assert.equal(activeA[0].title, 'State from Node B (Newer)');

  } finally {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(restoreDir, { recursive: true, force: true }).catch(() => {});
  }
});
