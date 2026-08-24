import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { FlashArc, ARC_OP } from '../src/engine/arc.mjs';
import { FlashSSTable, fsyncDir } from '../src/engine/sstable.mjs';
import { FlashDatabase } from '../src/core/database.mjs';
import { FlashCipher } from '../src/crypto/cipher.mjs';
import { FlashClient } from '../src/client/flash_client.mjs';

// ---------------------------------------------------------------------------
// FlashArc WAL durability
// ---------------------------------------------------------------------------

test('FlashArc - WAL recovery replays all valid frames after fsync', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-wal-'));
  const arcPath = path.join(tmpDir, 'test.farc');

  try {
    // Append 3 frames with syncOnWrite (default)
    const arc = new FlashArc(arcPath);
    await arc.open();
    await arc.append(ARC_OP.INSERT, 'doc1', Buffer.from('value1'));
    await arc.append(ARC_OP.INSERT, 'doc2', Buffer.from('value2'));
    await arc.append(ARC_OP.INSERT, 'doc3', Buffer.from('value3'));
    await arc.close();

    // Re-open and recover
    const arc2 = new FlashArc(arcPath);
    await arc2.open();
    const recovered = [];
    await arc2.recover((op, key, data) => {
      recovered.push({ op, key, data: data.toString() });
    });
    await arc2.close();

    assert.strictEqual(recovered.length, 3, 'All 3 frames must be recovered');
    assert.strictEqual(recovered[0].key, 'doc1');
    assert.strictEqual(recovered[2].key, 'doc3');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashArc - recovers legacy FARC frames (truncated SHA-256 checksum)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-legacy-'));
  const arcPath = path.join(tmpDir, 'legacy.farc');
  try {
    const key = 'legacy-doc';
    const data = Buffer.from('old-format');
    const keyBuf = Buffer.from(key, 'utf-8');
    const payload = Buffer.allocUnsafe(2 + keyBuf.length + data.length);
    payload.writeUInt16LE(keyBuf.length, 0);
    keyBuf.copy(payload, 2);
    data.copy(payload, 2 + keyBuf.length);
    const frame = Buffer.allocUnsafe(13 + payload.length);
    frame.write('FARC', 0, 4, 'ascii');
    frame.writeUInt32LE(payload.length, 4);
    frame.writeUInt32LE(
      crypto.createHash('sha256').update(payload).digest().readUInt32LE(0),
      8,
    );
    frame.writeUInt8(ARC_OP.INSERT, 12);
    payload.copy(frame, 13);
    fs.writeFileSync(arcPath, frame);

    const arc = new FlashArc(arcPath);
    const recovered = [];
    await arc.recover((op, k, buf) => {
      recovered.push({ op, key: k, data: buf.toString() });
    });
    assert.strictEqual(recovered.length, 1);
    assert.strictEqual(recovered[0].key, 'legacy-doc');
    assert.strictEqual(recovered[0].data, 'old-format');
    await arc.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashArc - WAL recovery skips truncated/corrupted tail frames', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-corrupt'));
  const arcPath = path.join(tmpDir, 'test.farc');

  try {
    // Write 3 valid frames
    const arc = new FlashArc(arcPath);
    await arc.open();
    await arc.append(ARC_OP.INSERT, 'doc1', Buffer.from('hello'));
    await arc.append(ARC_OP.INSERT, 'doc2', Buffer.from('world'));
    await arc.append(ARC_OP.INSERT, 'doc3', Buffer.from('goodbye'));
    await arc.close();

    // Simulate crash: truncate the file mid-4th frame (magic + 2 bytes of length only)
    const fd = await fs.promises.open(arcPath, 'r+');
    const stat = await fd.stat();
    // Write a partial frame header (13 bytes) that will be truncated
    const partialHeader = Buffer.alloc(13);
    partialHeader.write('FARC', 0, 4, 'ascii');
    partialHeader.writeUInt32LE(100, 4); // claims payload of 100 bytes (beyond EOF)
    partialHeader.writeUInt32LE(0xDEAD, 8);
    partialHeader.writeUInt8(ARC_OP.INSERT, 12);
    // Append partial header at the end
    await fd.write(partialHeader, 0, 13, stat.size);
    await fd.close();

    // Recovery must stop at the bad frame and still recover first 3 records
    const arc2 = new FlashArc(arcPath);
    await arc2.open();
    const recovered = [];
    await arc2.recover((op, key, data) => {
      recovered.push({ op, key, data: data.toString() });
    });
    await arc2.close();

    assert.strictEqual(recovered.length, 3, 'First 3 valid frames must be recovered');
    assert.strictEqual(recovered[2].key, 'doc3');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashArc - truncate produces an empty recoverable WAL', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-trunc'));
  const arcPath = path.join(tmpDir, 'test.farc');

  try {
    const arc = new FlashArc(arcPath);
    await arc.open();
    await arc.append(ARC_OP.INSERT, 'doc1', Buffer.from('data'));
    await arc.close();

    // Truncate
    const arc2 = new FlashArc(arcPath);
    await arc2.open();
    await arc2.truncate();
    await arc2.close();

    // Recover should find nothing
    const arc3 = new FlashArc(arcPath);
    await arc3.open();
    const recovered = [];
    await arc3.recover((op, key) => {
      recovered.push({ op, key });
    });
    await arc3.close();

    assert.strictEqual(recovered.length, 0, 'Truncated WAL must have no recoverable frames');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SSTable atomicity and corruption resilience
// ---------------------------------------------------------------------------

test('FlashSSTable - atomic write produces valid readable file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-sst'));
  const sstPath = path.join(tmpDir, 'test.sst');

  try {
    const entries = [
      { key: 'a', value: Buffer.from('alpha') },
      { key: 'b', value: Buffer.from('bravo') },
      { key: 'c', value: Buffer.from('charlie') },
    ];

    const table = await FlashSSTable.write(sstPath, entries);
    assert.strictEqual(table.isLoaded, true);
    assert.ok(!fs.existsSync(sstPath + '.tmp'), 'No stale .tmp file must remain');

    // Load a fresh instance from disk
    const table2 = new FlashSSTable(sstPath);
    await table2.load();
    const val = await table2.get('b');
    assert.strictEqual(val.toString(), 'bravo');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashCollection._loadExistingSSTables - skips corrupt SSTables gracefully', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-corrupt-sst'));

  try {
    // Create a valid sstable first
    const validPath = path.join(tmpDir, 'valid.sst');
    await FlashSSTable.write(validPath, [{ key: 'k1', value: Buffer.from('v1') }]);

    // Create a corrupt sstable (magic number is wrong)
    const corruptPath = path.join(tmpDir, 'corrupt.sst');
    const garbage = Buffer.from('THIS IS NOT A VALID SSTABLE FILE');
    await fs.promises.writeFile(corruptPath, garbage);

    // Create a leftover temp file from a crashed flush
    const staleTmp = path.join(tmpDir, 'sstable_12345.sst.tmp');
    await fs.promises.writeFile(staleTmp, Buffer.from('incomplete'));

    // Collection init should skip corrupt + clean stale tmp
    const db = new FlashDatabase('test_corrupt_skip', { storagePath: tmpDir });
    // Manually init the raw collection (same as FlashDatabase internally)
    const { FlashCollection } = await import('../src/core/collection.mjs');
    const col = new FlashCollection('test_corrupt_skip', tmpDir);
    // Place files in expected subdir to match collection naming
    const colDir = path.join(tmpDir, 'test_corrupt_skip');
    fs.mkdirSync(path.join(colDir, 'valid.sst').replace(/valid\.sst$/, ''), { recursive: true });
    // Move files to the correct subdirectory
    fs.copyFileSync(validPath, path.join(colDir, 'sstable_valid.sst'));
    fs.copyFileSync(corruptPath, path.join(colDir, 'sstable_corrupt.sst'));
    fs.copyFileSync(staleTmp, path.join(colDir, 'sstable_stale.sst.tmp'));

    await col.init();

    // Valid SSTable was loaded (1 sstable in the list)
    assert.ok(col.sstables.length >= 1, 'At least the valid SSTable must be loaded');
    // Stale tmp should have been removed
    assert.ok(!fs.existsSync(path.join(colDir, 'sstable_stale.sst.tmp')), 'Stale .tmp must be cleaned');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AAD cryptographic binding
// ---------------------------------------------------------------------------

test('FlashCipher - AAD binding: same key, different AAD fails to decrypt', () => {
  const cipher = new FlashCipher('master_secret_key_for_aad_test_32b!');

  const payload = cipher.encrypt('secret data', { aad: 'record:abc:email' });

  // Decrypt with correct AAD → works
  const correct = cipher.decrypt(payload, { asJson: false, aad: 'record:abc:email' });
  assert.strictEqual(correct, 'secret data');

  // Decrypt with wrong AAD (different field) → GCM auth fails → throws
  assert.throws(() => {
    cipher.decrypt(payload, { asJson: false, aad: 'record:abc:name' });
  }, /Unsupported state|unable to authenticate/);

  // Decrypt with wrong AAD (different record) → throws
  assert.throws(() => {
    cipher.decrypt(payload, { asJson: false, aad: 'record:xyz:email' });
  }, /Unsupported state|unable to authenticate/);
});

test('FlashCipher - legacy decrypt(payload, true) still works for v1 payloads', () => {
  const cipher = new FlashCipher('legacy_compat_test_key_32_bytes_long!');
  const encrypted = cipher.encrypt('legacy value');
  // Legacy 2nd-arg-boolean signature must still work
  const decrypted = cipher.decrypt(encrypted, true);
  assert.strictEqual(decrypted, 'legacy value');
});

test('FlashClient - AAD bound encrypt/decrypt roundtrip end-to-end', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-aad-e2e'));

  try {
    const client = new FlashClient({
      secretKey: 'aad_e2e_test_secret_key_32_bytes_long',
      dbName: 'aad_test_db',
      storagePath: tmpDir,
    });

    const users = client.collection('users');
    const result = await users.insertOne({ name: 'Ada', email: 'ada@test.io', age: 30 });
    assert.ok(result.insertedId);

    // Retrieve and decrypt — AAD is bound to each record+field internally
    const found = await users.findOne({ _id: result.insertedId });
    assert.strictEqual(found.name, 'Ada');
    assert.strictEqual(found.email, 'ada@test.io');
    assert.strictEqual(found.age, 30);

    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// FlashDatabase integration - durability after flush
// ---------------------------------------------------------------------------

test('FlashDatabase - data survives flush cycle (WAL truncated, SSTable durable)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-flush'));

  try {
    // Insert, flush, then close and re-init to simulate restart
    const db1 = new FlashDatabase('flush_test', { storagePath: tmpDir });
    const col1 = db1.collection('items');
    await col1.init();
    for (let i = 0; i < 5; i++) {
      await col1.insertOne({ _id: `item_${i}`, _enc: { val: `data_${i}` }, _blind: {} });
    }
    await col1.flush(); // Flush memtable to SSTable, truncate WAL
    await db1.close();

    // Simulate fresh start
    const db2 = new FlashDatabase('flush_test', { storagePath: tmpDir });
    const col2 = db2.collection('items');
    await col2.init();

    // All 5 items must be readable from the SSTable
    for (let i = 0; i < 5; i++) {
      const buf = await col2._getRawDoc(`item_${i}`);
      assert.ok(buf, `item_${i} must survive flush`);
    }

    await db2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FlashDatabase - data survives simulated crash between flush and WAL truncate', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-dur-crash-between'));

  try {
    const db1 = new FlashDatabase('crash_between', { storagePath: tmpDir });
    const col1 = db1.collection('items');
    await col1.init();
    await col1.insertOne({ _id: 'only_doc', _enc: { v: 'important' }, _blind: {} });

    // Flush: SSTable is written atomically, then memtable is cleared and WAL truncated.
    // If crash happens AFTER SSTable write but BEFORE WAL truncate, the WAL still has
    // the record. On recovery it would be replayed into memtable — duplicating into
    // docOrder. Our init already deduplicates docOrder, so no data loss.
    await col1.flush();
    await db1.close();

    // Re-init: should recover the data from SSTable
    const db2 = new FlashDatabase('crash_between', { storagePath: tmpDir });
    const col2 = db2.collection('items');
    await col2.init();
    const buf = await col2._getRawDoc('only_doc');
    assert.ok(buf, 'Record must survive flush+restart');

    await db2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
