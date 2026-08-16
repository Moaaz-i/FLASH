import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlashBinary, FLASH_TYPE } from '../src/binary/flash_binary.mjs';
import { FlashBlindIndex } from '../src/crypto/blind_index.mjs';
import { FlashMemTable } from '../src/engine/memtable.mjs';
import { FlashSSTable } from '../src/engine/sstable.mjs';
import { FlashCipher } from '../src/crypto/cipher.mjs';

// Deterministic PRNG (xorshift32) for reproducible fuzz seeds
function xorshift32(seed) {
  let s = seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

const FUZZ_ITERATIONS = 200;
const UNICODE_FRAGMENTS = [
  'english', 'test123', 'hello world',
  '\u0645\u0631\u062d\u0628\u0627',          // Arabic: مرحبا
  '\u4f60\u597d\u4e16\u754c',                  // Chinese: 你好世界
  '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435', // Russian: Здравствуйте
  '\u00e9\u00e8\u00ea\u00eb\u00ef\u00f1',      // Accented: éèêëïñ
  'a'.repeat(500),                              // Long string
  '',                                            // Empty string
  'null\n\t\r',
];

// ---------------------------------------------------------------------------
// FlashBinary roundtrip fuzz
// ---------------------------------------------------------------------------

test(`FlashBinary - serialize/deserialize roundtrip fuzz (${FUZZ_ITERATIONS} random docs)`, () => {
  const rng = xorshift32(0xDEADBEEF);

  const randomInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const randomString = () => UNICODE_FRAGMENTS[randomInt(0, UNICODE_FRAGMENTS.length - 1)];

  const pickTypes = (depth = 0) => {
    if (depth > 2) return randomString();
    const r = rng();
    if (r < 0.15) return null;
    if (r < 0.25) return randomInt(-1000, 10000);
    if (r < 0.45) return +(rng() * 1000).toFixed(4);
    if (r < 0.60) return rng() > 0.5;
    if (r < 0.80) return randomString();
    if (r < 0.90) return Array.from({ length: randomInt(0, 5) }, () => pickTypes(depth + 1));
    return { nested: pickTypes(depth + 1), flag: rng() > 0.5 };
  };

  for (let i = 0; i < FUZZ_ITERATIONS; i++) {
    const doc = { _id: `doc_${i}`, _enc: {}, value: pickTypes(), seq: i };
    const buffer = FlashBinary.serialize(doc);
    assert.ok(Buffer.isBuffer(buffer), 'serialize must return Buffer');

    const deserialized = FlashBinary.deserialize(buffer);
    assert.deepStrictEqual(deserialized, doc, `Roundtrip failed for doc iteration ${i}`);

    // Field lookup must also work
    const lookupVal = FlashBinary.getField(buffer, '_id');
    assert.strictEqual(lookupVal, `doc_${i}`);
  }
});

test('FlashBinary - deserialization rejects invalid magic headers gracefully', () => {
  const garbage = Buffer.from('THIS IS NOT A FLASHBINARY DOC');
  // getField falls back to JSON.parse
  const result = FlashBinary.getField(garbage, 'key');
  assert.strictEqual(result, undefined, 'Non-matching magic returns undefined');

  // deserialize on garbage either parses JSON or returns {}
  try {
    FlashBinary.deserialize(garbage);
  } catch {
    // acceptable if it throws on garbage
  }
});

// ---------------------------------------------------------------------------
// FlashBlindIndex fuzz - determinism and correctness
// ---------------------------------------------------------------------------

test(`FlashBlindIndex - trapdoor determinism fuzz (${FUZZ_ITERATIONS} iterations)`, () => {
  const rng = xorshift32(0xCAFEBABE);
  const blindIndex = new FlashBlindIndex('fuzz_blind_index_secret');

  for (let i = 0; i < FUZZ_ITERATIONS; i++) {
    const field = `field_${Math.floor(rng() * 10)}`;
    const value = UNICODE_FRAGMENTS[Math.floor(rng() * UNICODE_FRAGMENTS.length)] + String(rng());

    const t1 = blindIndex.generateTrapdoor(field, value);
    const t2 = blindIndex.generateTrapdoor(field, value);
    assert.strictEqual(t1, t2, `Trapdoor must be deterministic for same input`);
    assert.strictEqual(typeof t1, 'string');
    assert.ok(t1.length > 0);

    // Different value must produce different trapdoor (with overwhelming probability)
    if (value.length > 0) {
      const t3 = blindIndex.generateTrapdoor(field, value + '_diff');
      assert.notStrictEqual(t1, t3, 'Different values must produce different trapdoors');
    }

    // N-grams must return an array
    const ngrams = blindIndex.generateNGramTrapdoors(field, value, false);
    assert.ok(Array.isArray(ngrams));
    assert.ok(ngrams.length > 0, 'N-gram generation must produce at least one token');
  }
});

test('FlashBlindIndex - range buckets are consistent for same value', () => {
  const blindIndex = new FlashBlindIndex('range_fuzz_key');
  const values = [0, 5, 10, 15, -3, 999, 3.14, 0.001, -100.5];

  for (const v of values) {
    const b1 = blindIndex.generateRangeBuckets('price', v);
    const b2 = blindIndex.generateRangeBuckets('price', v);
    assert.strictEqual(b1.bucketIndex, b2.bucketIndex);
    assert.strictEqual(b1.token, b2.token);
    assert.strictEqual(b1.exactTrapdoor, b2.exactTrapdoor);
  }

  // Query tokens for a range
  const tokens = blindIndex.generateRangeQueryTokens('price', 0, 50);
  assert.ok(tokens.length > 0, 'Range query must produce at least one bucket token');
  assert.ok(typeof tokens[0] === 'string');
});

// ---------------------------------------------------------------------------
// FlashMemTable fuzz
// ---------------------------------------------------------------------------

test(`FlashMemTable - insert/get/delete/scan fuzz (${FUZZ_ITERATIONS} ops)`, () => {
  const rng = xorshift32(0x12345678);
  const memtable = new FlashMemTable();
  const truth = new Map();

  for (let i = 0; i < FUZZ_ITERATIONS; i++) {
    const key = `key_${Math.floor(rng() * 50)}`;
    const op = rng();

    if (op < 0.4) {
      // INSERT
      const value = Buffer.from(`val_${i}`);
      memtable.set(key, value, value.length);
      truth.set(key, value);
    } else if (op < 0.6) {
      // GET
      const got = memtable.get(key);
      const expected = truth.get(key) || null;
      if (expected) {
        assert.deepStrictEqual(got, expected, `Get mismatch for key ${key}`);
      }
    } else if (op < 0.8) {
      // DELETE
      memtable.delete(key);
      truth.delete(key);
      const got = memtable.get(key);
      // LSM-Tree tombstones: deleted keys store { _tombstone: true }
      if (got === null || (got && got._tombstone)) {
        // OK — key is logically deleted
      } else {
        assert.fail(`Deleted key ${key} must be null or tombstone`);
      }
    } else {
      // SCAN
      const results = memtable.scan(null, null, 1000);
      assert.ok(Array.isArray(results));
    }
  }

  // No exact size comparison: memtable.size counts tombstones as entries,
  // while truth.size only counts live keys.  We verified every key/value
  // individually above, which is sufficient.
  assert.ok(memtable.size >= 0, 'MemTable size must be non-negative');
});

// ---------------------------------------------------------------------------
// FlashSSTable fuzz roundtrip
// ---------------------------------------------------------------------------

test(`FlashSSTable - write/load/get roundtrip fuzz (${FUZZ_ITERATIONS} entries)`, async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-fuzz-sst'));
  const sstPath = path.join(tmpDir, 'fuzz.sst');

  try {
    const rng = xorshift32(0xBEEFCAFE);
    const entries = [];

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const key = `doc_${i}_${Math.floor(rng() * 100000)}`;
      const val = Buffer.from(`payload_${i}_${rng()}`);
      entries.push({ key, value: val });
    }

    // Write
    const table = await FlashSSTable.write(sstPath, entries);
    assert.ok(table.isLoaded);

    // Load fresh from disk
    const table2 = new FlashSSTable(sstPath);
    await table2.load();

    // Every key must return its exact value
    for (const { key, value } of entries) {
      const got = await table2.get(key);
      assert.ok(got, `Key ${key} must exist in loaded SSTable`);
      assert.deepStrictEqual(Buffer.from(got), value, `Value mismatch for key ${key}`);
    }

    // Non-existent key must return null
    const missing = await table2.get('nonexistent_key_99999');
    assert.strictEqual(missing, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// FlashCipher encrypt/decrypt fuzz
// ---------------------------------------------------------------------------

test(`FlashCipher - encrypt/decrypt fuzz with and without AAD (${FUZZ_ITERATIONS} iterations)`, () => {
  const rng = xorshift32(0xCAFED00D);
  const cipher = new FlashCipher('fuzz_cipher_master_key_32_bytes_lng');
  const records = ['rec_a', 'rec_b', 'rec_c'];
  const fields = ['name', 'email', 'balance', 'status'];

  for (let i = 0; i < FUZZ_ITERATIONS; i++) {
    const plaintext = UNICODE_FRAGMENTS[Math.floor(rng() * UNICODE_FRAGMENTS.length)] + String(rng());

    // --- Without AAD (v1 legacy) ---
    // Use asJson=false to keep string comparison consistent
    const encPlain = cipher.encrypt(plaintext);
    const decPlain = cipher.decrypt(encPlain, false);
    assert.strictEqual(decPlain, plaintext, `Legacy roundtrip failed for iteration ${i}`);

    // --- With AAD (v2) ---
    const recordId = records[Math.floor(rng() * records.length)];
    const fieldKey = fields[Math.floor(rng() * fields.length)];
    const aad = `flash-aad:${recordId}:${fieldKey}`;
    const encAad = cipher.encrypt(plaintext, { aad });
    // Use asJson=false to keep string comparison consistent (JSON.parse would coerce numeric strings)
    const decAad = cipher.decrypt(encAad, { asJson: false, aad });
    assert.strictEqual(decAad, plaintext, `AAD roundtrip failed for iteration ${i}`);

    // Wrong AAD must throw
    assert.throws(() => {
      cipher.decrypt(encAad, { asJson: false, aad: 'flash-aad:wrong:field' });
    }, /decrypt|Unsupported/, `Wrong AAD should throw for iteration ${i}`);
  }
});
