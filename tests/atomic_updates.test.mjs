import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FlashClient } from '../src/index.mjs';

test('Atomic Updates - Full In-Place Operators ($set, $inc, $mul, $push, $pull, $addToSet, upsert)', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_updates_test_${Date.now()}`);
  const client = new FlashClient({
    secretKey: 'master_passphrase_updates_test',
    storagePath: tmpDir
  });

  try {
    const users = client.collection('users');

    // Initial insert
    const insertRes = await users.insertOne({
      username: 'john_doe',
      balance: 100,
      score: 50,
      tags: ['developer'],
      profile: {
        theme: 'dark',
        views: 10
      }
    });

    const id = insertRes.insertedId;

    // 1. Test $set, $inc, and $mul
    await users.updateOne(
      { _id: id },
      {
        $set: { 'profile.theme': 'cyberpunk', status: 'active' },
        $inc: { balance: 50, 'profile.views': 5 },
        $mul: { score: 2 }
      }
    );

    let doc = await users.findById(id);
    assert.equal(doc.status, 'active');
    assert.equal(doc.profile.theme, 'cyberpunk');
    assert.equal(doc.profile.views, 15);
    assert.equal(doc.balance, 150);
    assert.equal(doc.score, 100);

    // 2. Test $push with $each, $addToSet, and $pull
    await users.updateOne(
      { _id: id },
      {
        $push: { tags: { $each: ['crypto', 'security'] } },
        $addToSet: { tags: 'developer' } // Should not duplicate 'developer'
      }
    );

    doc = await users.findById(id);
    assert.deepEqual(doc.tags, ['developer', 'crypto', 'security']);

    // Remove 'crypto' with $pull
    await users.updateOne(
      { _id: id },
      {
        $pull: { tags: 'crypto' }
      }
    );

    doc = await users.findById(id);
    assert.deepEqual(doc.tags, ['developer', 'security']);

    // 3. Test $unset
    await users.updateOne(
      { _id: id },
      {
        $unset: { score: 1 }
      }
    );

    doc = await users.findById(id);
    assert.equal(doc.score, undefined);

    // 4. Test upsert: true
    const upsertRes = await users.updateOne(
      { username: 'alice_wonder' },
      { $set: { username: 'alice_wonder', role: 'admin', balance: 500 } },
      { upsert: true }
    );

    assert.ok(upsertRes.upsertedId, 'Should create new document on upsert');
    const alice = await users.findById(upsertRes.upsertedId);
    assert.equal(alice.username, 'alice_wonder');
    assert.equal(alice.role, 'admin');

    // 5. Test findOneAndUpdate
    const updatedAlice = await users.findOneAndUpdate(
      { username: 'alice_wonder' },
      { $inc: { balance: 100 } },
      { new: true }
    );

    assert.equal(updatedAlice.balance, 600);

  } finally {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
