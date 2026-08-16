import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FlashClient } from '../src/index.mjs';

test('Fluent Chaining Query Builder - Sort, Limit, Skip, Select, Where, and Streaming', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_fluent_test_${Date.now()}`);
  const client = new FlashClient({
    secretKey: 'master_passphrase_fluent_test',
    storagePath: tmpDir
  });

  try {
    const products = client.collection('products');

    // Insert test records
    await products.insertMany([
      { name: 'Laptop Pro', price: 1200, category: 'electronics', rating: 4.8 },
      { name: 'Wireless Mouse', price: 25, category: 'electronics', rating: 4.2 },
      { name: 'Mechanical Keyboard', price: 90, category: 'electronics', rating: 4.6 },
      { name: 'Desk Lamp', price: 40, category: 'home', rating: 4.1 },
      { name: 'Ergonomic Chair', price: 350, category: 'furniture', rating: 4.9 }
    ]);

    // 1. Test Fluent Chaining: .sort() and .limit()
    const topExpensive = await products.find()
      .sort({ price: -1 })
      .limit(2)
      .select({ name: 1, price: 1 });

    assert.equal(topExpensive.length, 2);
    assert.equal(topExpensive[0].name, 'Laptop Pro');
    assert.equal(topExpensive[1].name, 'Ergonomic Chair');
    assert.equal(topExpensive[0].category, undefined, 'Category should be omitted by projection');

    // 2. Test .where().gte() chaining
    const cheapProducts = await products.find()
      .where('price').lt(100)
      .sort({ price: 1 });

    assert.equal(cheapProducts.length, 3);
    assert.equal(cheapProducts[0].name, 'Wireless Mouse');
    assert.equal(cheapProducts[1].name, 'Desk Lamp');
    assert.equal(cheapProducts[2].name, 'Mechanical Keyboard');

    // 3. Test .skip() and .limit() pagination
    const page2 = await products.find()
      .sort({ price: 1 })
      .skip(2)
      .limit(2);

    assert.equal(page2.length, 2);
    assert.equal(page2[0].name, 'Mechanical Keyboard');
    assert.equal(page2[1].name, 'Ergonomic Chair');

    // 4. Test explain('executionStats')
    const explainOutput = await products.find({ category: 'electronics' }).explain();
    assert.ok(explainOutput.executionStats);
    assert.equal(explainOutput.executionStats.executionSuccess, true);

    // 5. Test Async Stream Iteration
    const streamNames = [];
    for await (const doc of products.find().sort({ rating: -1 }).stream(2)) {
      streamNames.push(doc.name);
    }

    assert.equal(streamNames.length, 5);
    assert.equal(streamNames[0], 'Ergonomic Chair');

  } finally {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
