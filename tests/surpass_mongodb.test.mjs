import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlashClient } from '../src/client/flash_client.mjs';
import { FlashCluster } from '../src/cluster/distributed_cluster.mjs';
import { FlashDatabase } from '../src/core/database.mjs';
import { FlashFuzzyEngine } from '../src/crypto/fuzzy_search.mjs';

test('FlashFuzzyEngine - Direct Unit Tests for Levenshtein & Soundex', () => {
  // 1. Levenshtein Distance Tests
  assert.strictEqual(FlashFuzzyEngine.levenshtein('kitten', 'sitting'), 3);
  assert.strictEqual(FlashFuzzyEngine.levenshtein('Alan', 'Alan'), 0);
  assert.strictEqual(FlashFuzzyEngine.levenshtein('Turing', 'Turin'), 1);
  assert.strictEqual(FlashFuzzyEngine.levenshtein('', 'hello'), 5);
  assert.strictEqual(FlashFuzzyEngine.levenshtein('world', ''), 5);

  // 2. Soundex Phonetic Code Tests
  assert.strictEqual(FlashFuzzyEngine.soundex('Robert'), 'R163');
  assert.strictEqual(FlashFuzzyEngine.soundex('Rupert'), 'R163');
  assert.strictEqual(FlashFuzzyEngine.soundex('Turing'), 'T652');
  assert.strictEqual(FlashFuzzyEngine.soundex(''), '');
  assert.strictEqual(FlashFuzzyEngine.soundex(null), '');
});

test('Surpass MongoDB - Encrypted Fuzzy Search & Phonetic Matching', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-fuzzy-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'fuzzy_master_key_2026',
      storagePath: tmpDir
    });

    const scientists = client.collection('scientists');

    await scientists.insertOne({ name: 'Alan Turing', field: 'Cryptanalysis' });
    await scientists.insertOne({ name: 'Albert Einstein', field: 'Relativity' });

    // 1. Fuzzy query with typo: "Alen Turing" (Distance: 1)
    const fuzzyResults = await scientists.find({
      name: { $fuzzy: 'Alen Turing', maxDistance: 1 }
    });
    assert.strictEqual(fuzzyResults.length, 1);
    assert.strictEqual(fuzzyResults[0].name, 'Alan Turing');

    // 2. Phonetic Soundex match
    const soundexResults = await scientists.find({
      name: { $soundex: 'Allan Turing' }
    });
    assert.strictEqual(soundexResults.length, 1);
    assert.strictEqual(soundexResults[0].name, 'Alan Turing');

    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Surpass MongoDB - Distributed Sharding Ring with Consistent Hashing', () => {
  const cluster = new FlashCluster({ virtualNodes: 128 });

  const db1 = new FlashDatabase('shard_us_east');
  const db2 = new FlashDatabase('shard_eu_west');
  const db3 = new FlashDatabase('shard_ap_south');

  cluster.addShard('shard_us_east', db1);
  cluster.addShard('shard_eu_west', db2);
  cluster.addShard('shard_ap_south', db3);

  assert.strictEqual(cluster.listShards().length, 3);

  // Partition keys deterministically
  const shardA = cluster.getShardForKey('user_1001');
  const shardB = cluster.getShardForKey('user_2002');
  const shardC = cluster.getShardForKey('user_3003');

  assert.ok(shardA && shardA.shardId);
  assert.ok(shardB && shardB.shardId);
  assert.ok(shardC && shardC.shardId);

  // Consistency check: Same key always resolves to same shard
  const shardA_repeat = cluster.getShardForKey('user_1001');
  assert.strictEqual(shardA.shardId, shardA_repeat.shardId);
});

test('Surpass MongoDB - Advanced Aggregation ($unwind, $project, $addFields)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-agg-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'agg_master_key_2026',
      storagePath: tmpDir
    });

    const employees = client.collection('employees');

    await employees.insertOne({
      name: 'Ada Lovelace',
      salary: 5000,
      skills: ['Mathematics', 'Computing', 'Analysis']
    });

    // Pipeline with $unwind and $project and $addFields
    const results = await employees.aggregate([
      { $unwind: '$skills' },
      { $addFields: { currency: 'USD' } },
      { $project: { name: 1, skills: 1, currency: 1, salary: 1 } }
    ]);

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].skills, 'Mathematics');
    assert.strictEqual(results[0].currency, 'USD');
    assert.strictEqual(results[1].skills, 'Computing');

    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Surpass MongoDB - Built-In Web GUI Dashboard Server', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-gui-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'gui_master_key_2026',
      storagePath: tmpDir
    });

    const items = client.collection('items');
    await items.insertOne({ label: 'Item 1' });

    const server = client.openDashboard({ port: 3987 });
    assert.ok(server);

    server.close();
    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashArc - .farc Format Verification and Durability', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-arc-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'arc_master_key_2026',
      storagePath: tmpDir
    });

    const vault = client.collection('vault');
    await vault.insertOne({ item: 'Quantum Core', status: 'secured' });

    // Verify commit.farc file was created on disk
    const farcPath = path.join(tmpDir, 'flash_db', 'vault', 'commit.farc');
    assert.ok(fs.existsSync(farcPath), 'commit.farc file must exist on disk');

    // Verify 'FARC' magic bytes at the beginning of the file
    const fileBytes = fs.readFileSync(farcPath);
    const magic = fileBytes.subarray(0, 4).toString('ascii');
    assert.strictEqual(magic, 'FARC', 'Magic header of .farc must be "FARC"');

    // Crash Recovery Test: Open second client pointing to same folder
    const client2 = new FlashClient({
      secretKey: 'arc_master_key_2026',
      storagePath: tmpDir
    });
    const vault2 = client2.collection('vault');
    const recovered = await vault2.find();
    assert.strictEqual(recovered.length, 1);
    assert.strictEqual(recovered[0].item, 'Quantum Core');

    await client.close();
    await client2.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

