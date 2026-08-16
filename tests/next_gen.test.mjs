import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlashClient } from '../src/client/flash_client.mjs';
import { FlashPQC } from '../src/crypto/pqc.mjs';
import { FlashSchema } from '../src/schema/schema_validator.mjs';
import { FlashVectorIndex } from '../src/vector/vector_index.mjs';

test('Next-Gen - AI Vector Search & Private RAG Embeddings', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-vector-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'vector_master_secret_2026',
      storagePath: tmpDir
    });

    const articles = client.collection('articles');

    await articles.insertOne({
      title: 'Zero Knowledge Cryptography',
      topic: 'crypto',
      $vector: [0.95, 0.85, -0.10, 0.05]
    });

    await articles.insertOne({
      title: 'Quantum Computing and Lattice Crypto',
      topic: 'crypto',
      $vector: [0.90, 0.80, -0.08, 0.12]
    });

    await articles.insertOne({
      title: 'Mediterranean Cooking Recipes',
      topic: 'food',
      $vector: [-0.60, -0.80, 0.70, 0.40]
    });

    // Search nearest vector to Cryptography query
    const results = await articles.vectorSearch({
      vector: [0.92, 0.83, -0.09, 0.08],
      topK: 2
    });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].topic, 'crypto');
    assert.ok(results[0]._score > 0.98, 'Cosine similarity should be very high (>0.98)');

    // Search with Metadata Filter
    const foodResults = await articles.vectorSearch({
      vector: [0.92, 0.83, -0.09, 0.08],
      topK: 2,
      filter: { topic: 'food' }
    });
    assert.strictEqual(foodResults.length, 1);
    assert.strictEqual(foodResults[0].title, 'Mediterranean Cooking Recipes');

    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Next-Gen - Real-Time Change Streams & Reactive Watchers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-stream-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'stream_master_secret_2026',
      storagePath: tmpDir
    });

    const chats = client.collection('chats');
    const receivedEvents = [];

    const watcher = chats.watch();
    watcher.on('insert', (event) => {
      receivedEvents.push(event);
    });

    await chats.insertOne({ sender: 'Alice', message: 'Hello Quantum World' });
    await chats.insertOne({ sender: 'Bob', message: 'Hi Alice!' });

    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(receivedEvents[0].doc.sender, 'Alice');
    assert.strictEqual(receivedEvents[1].doc.sender, 'Bob');

    watcher.close();
    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Next-Gen - ACID Multi-Document Transactions & Rollback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-txn-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'txn_master_secret_2026',
      storagePath: tmpDir
    });

    const accounts = client.collection('accounts');
    const session = client.startSession();

    // 1. Staged and Committed Transaction
    session.startTransaction();
    session.stagedOperations.push(
      { collectionName: 'accounts', type: 'insert', doc: { account: 'ACC_01', balance: 5000 } },
      { collectionName: 'accounts', type: 'insert', doc: { account: 'ACC_02', balance: 3000 } }
    );
    await session.commitTransaction();

    const allAccounts = await accounts.find();
    assert.strictEqual(allAccounts.length, 2);

    // 2. Staged and Aborted Transaction (Rollback)
    session.startTransaction();
    session.stagedOperations.push(
      { collectionName: 'accounts', type: 'insert', doc: { account: 'ACC_CANCELLED', balance: 9999 } }
    );
    await session.abortTransaction();

    const afterAbort = await accounts.find();
    assert.strictEqual(afterAbort.length, 2, 'Aborted transaction should not alter database state');

    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Next-Gen - Post-Quantum Cryptography (PQC) Lattice Key Exchange', () => {
  const keys = FlashPQC.generateKeyPair();
  assert.ok(keys.publicKey && keys.publicKey.length === 128);
  assert.ok(keys.secretKey && keys.secretKey.length === 128);

  const enc = FlashPQC.encapsulateSecret(keys.publicKey);
  assert.ok(enc.sharedSecret && enc.sharedSecret.length === 32);

  const decShared = FlashPQC.decapsulateSecret(enc.ciphertext, keys.secretKey);
  assert.ok(Buffer.isBuffer(decShared) && decShared.length === 32);

  const hardenedKey = FlashPQC.deriveQuantumHardenedKey('my_passphrase');
  assert.strictEqual(hardenedKey.length, 32);
});

test('Next-Gen - Flexible Schema Validation & Defaults', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-schema-test-'));

  try {
    const client = new FlashClient({
      secretKey: 'schema_master_secret_2026',
      storagePath: tmpDir
    });

    const products = client.collection('products', {
      schema: {
        title: { type: 'string', required: true, min: 3 },
        price: { type: 'number', required: true, min: 0 },
        inStock: { type: 'boolean', default: true }
      }
    });

    // Valid insert with default inStock applied
    const res = await products.insertOne({
      title: 'Quantum Hardware Token',
      price: 299.99
    });

    const doc = await products.findOne({ _id: res.insertedId });
    assert.strictEqual(doc.inStock, true, 'Default value should be applied');

    // Invalid insert (missing required price)
    await assert.rejects(
      async () => {
        await products.insertOne({ title: 'Invalid Product' });
      },
      /SchemaValidationError: Field "price" is required/
    );

    await client.close();
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
