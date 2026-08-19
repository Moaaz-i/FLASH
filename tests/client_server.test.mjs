import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FlashServer, FlashClient } from '../src/index.mjs';

test('Client-Server Mode - Remote FlashClient connecting over network URI to FlashServer', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_remote_test_${Date.now()}`);
  const port = 6850;
  const authKey = 'super_secure_server_token_2026';

  let server;

  try {
    // 1. Start remote standalone server daemon
    server = FlashServer.start({
      port,
      host: '127.0.0.1',
      storagePath: tmpDir,
      authKey
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 2. Initialize remote client SDK
    const client = new FlashClient({
      uri: `flash://127.0.0.1:${port}`,
      authKey,
      secretKey: 'user_client_side_master_key_123'
    });

    const users = client.collection('users');

    // 3. Insert documents over network
    const insertRes = await users.insertOne({
      name: 'Linus Torvalds',
      email: 'linus@kernel.org',
      role: 'creator'
    });

    assert.ok(insertRes.insertedId, 'Should return insertedId from remote server');

    // 4. Query over network with client-side decryption
    const found = await users.find({ name: 'Linus Torvalds' });
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'Linus Torvalds');
    assert.equal(found[0].email, 'linus@kernel.org');

    // 5. Query with $fuzzy match over network
    const fuzzy = await users.find({ name: { $fuzzy: 'Lenus' } });
    assert.equal(fuzzy.length, 1);
    assert.equal(fuzzy[0].name, 'Linus Torvalds');

    // 6. Delete document over network
    const delRes = await users.deleteOne({ _id: insertRes.insertedId });
    assert.equal(delRes.deletedCount, 1);

    const remaining = await users.find({});
    assert.equal(remaining.length, 0);

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
