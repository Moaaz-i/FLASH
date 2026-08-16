import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FlashClient, DuplicateKeyError } from '../src/index.mjs';

test('Secondary & Unique Indexes - Constraint Enforcement & DuplicateKeyError', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_indexes_test_${Date.now()}`);
  const client = new FlashClient({
    secretKey: 'master_passphrase_indexes_test',
    storagePath: tmpDir
  });

  try {
    const accounts = client.collection('accounts');

    // 1. Create Unique Index on 'email'
    const indexName = accounts.createIndex({ email: 1 }, { unique: true });
    assert.ok(indexName);

    const indexes = accounts.listIndexes();
    assert.equal(indexes.length, 1);
    assert.equal(indexes[0].unique, true);

    // 2. Insert First Document
    await accounts.insertOne({
      username: 'user1',
      email: 'unique@domain.com'
    });

    // 3. Attempt to insert duplicate email -> Should throw DuplicateKeyError
    await assert.rejects(
      async () => {
        await accounts.insertOne({
          username: 'user2',
          email: 'unique@domain.com'
        });
      },
      DuplicateKeyError,
      'Should reject duplicate email insertion'
    );

    // 4. Update with unique violation -> Should throw DuplicateKeyError
    const user2Res = await accounts.insertOne({
      username: 'user2',
      email: 'another@domain.com'
    });

    await assert.rejects(
      async () => {
        await accounts.updateOne(
          { _id: user2Res.insertedId },
          { $set: { email: 'unique@domain.com' } }
        );
      },
      DuplicateKeyError,
      'Should reject update that violates unique constraint'
    );

    // 5. Drop Index
    const dropped = accounts.dropIndex(indexName);
    assert.equal(dropped, true);

    const indexesAfterDrop = accounts.listIndexes();
    assert.equal(indexesAfterDrop.length, 0);

  } finally {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
