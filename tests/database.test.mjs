import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlashClient } from '../src/client/flash_client.mjs';

test('FlashClient - Full Integration: CRUD, Blind Index Search, Aggregation, and Merkle Proofs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-db-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'master_passphrase_for_test_suite_2026',
      dbName: 'test_db',
      storagePath: tmpDir,
      fieldPolicy: {
        status: 'plaintext',
        balance: 'counter'
      }
    });

    const users = await client.collection('users');

    // 1. Insert Documents
    const insert1 = await users.insertOne({
      name: 'Alexander Turing',
      email: 'alex@cipher.io',
      age: 28,
      role: 'Cryptographer',
      balance: 1500,
      status: 'active'
    });

    assert.ok(insert1.insertedId);
    assert.ok(insert1.merkleRoot);

    const batch = await users.insertMany([
      { name: 'Sarah Connor', email: 'sarah@resistance.net', age: 34, role: 'Defender', balance: 3200, status: 'active' },
      { name: 'John Doe', email: 'john@secret.org', age: 45, role: 'Analyst', balance: 800, status: 'suspended' },
      { name: 'Alex Johnson', email: 'alex.j@flashdb.io', age: 22, role: 'Developer', balance: 2100, status: 'active' }
    ]);

    assert.strictEqual(batch.insertedCount, 3);
    assert.strictEqual(await users.count(), 4);

    // 2. Exact Match Query on Encrypted Field ($eq)
    const exactResult = await users.find({ email: 'alex@cipher.io' });
    assert.strictEqual(exactResult.length, 1);
    assert.strictEqual(exactResult[0].name, 'Alexander Turing');

    // 3. Substring / N-Gram Query ($regex)
    const regexResults = await users.find({ name: { $regex: 'Alex' } });
    assert.strictEqual(regexResults.length, 2);

    // 4. Range Query ($gt, $gte, $lte)
    const rangeResults = await users.find({ age: { $gte: 30 } });
    assert.strictEqual(rangeResults.length, 2);

    // 5. Client Stream Aggregation ($match, $group, $sum, $avg)
    const aggregation = await users.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$status', totalBalance: { $sum: '$balance' }, avgAge: { $avg: '$age' }, count: { $count: 1 } } }
    ]);

    assert.strictEqual(aggregation.length, 1);
    assert.strictEqual(aggregation[0].count, 3);
    assert.strictEqual(aggregation[0].totalBalance, 6800);

    // 6. Relationships & FK Joins ($lookup and populate)
    const posts = client.collection('posts');
    await posts.insertMany([
      { title: 'Turing Machines', authorId: insert1.insertedId, views: 1500 },
      { title: 'Cryptanalysis of Enigma', authorId: insert1.insertedId, views: 3200 },
      { title: 'Cobol Evolution', authorId: batch.insertedIds[0], views: 800 }
    ]);

    // Test $lookup in aggregate
    const usersWithPosts = await users.aggregate([
      { $match: { email: 'alex@cipher.io' } },
      {
        $lookup: {
          from: 'posts',
          localField: '_id',
          foreignField: 'authorId',
          as: 'articles'
        }
      }
    ]);

    assert.strictEqual(usersWithPosts.length, 1);
    assert.strictEqual(usersWithPosts[0].articles.length, 2);
    assert.strictEqual(usersWithPosts[0].articles[0].title, 'Turing Machines');

    // Test populate in find
    const populatedFind = await users.find({ email: 'alex@cipher.io' }, {
      populate: [
        { from: 'posts', localField: '_id', foreignField: 'authorId', as: 'myArticles' }
      ]
    });
    assert.strictEqual(populatedFind.length, 1);
    assert.strictEqual(populatedFind[0].myArticles.length, 2);

    // 7. Merkle Proof Verification
    const integrity = await users.verifyRecordIntegrity(insert1.insertedId);
    assert.strictEqual(integrity.isValid, true);

    // 7. Delete Record
    const del = await users.deleteOne({ email: 'john@secret.org' });
    assert.strictEqual(del.deletedCount, 1);
    assert.strictEqual(await users.count(), 3);

    // 8. Test LSM-Tree SSTable Flush & Multi-tier Lookups
    const sstBeforeFlush = users.raw.sstables.length;
    await users.raw.flush(); // Flush MemTable to SSTable
    assert.strictEqual(users.raw.sstables.length, sstBeforeFlush + 1, 'SSTable file must be generated on flush');
    assert.strictEqual(users.raw.memtable.size, 0, 'MemTable must be cleared after flush');

    // Verify that queries still seamlessly work directly from the compressed SSTable
    const sstQuery = await users.find({ email: 'sarah@resistance.net' });
    assert.strictEqual(sstQuery.length, 1);
    assert.strictEqual(sstQuery[0].name, 'Sarah Connor');

    await client.close();
  } finally {
    // Cleanup temporary OS files
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});
