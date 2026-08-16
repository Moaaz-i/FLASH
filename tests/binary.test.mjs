import test from 'node:test';
import assert from 'node:assert';
import { FlashBinary, FLASH_TYPE } from '../src/binary/flash_binary.mjs';

test('FlashBinary - Zero-Copy Serialization & O(1) Field Lookup', () => {
  const doc = {
    userId: 1042,
    username: 'flash_master',
    isAdmin: true,
    score: 98.75,
    metadata: { role: 'superadmin', tags: ['fast', 'secure'] },
    notes: 'Zero-copy binary layout test'
  };

  const buffer = FlashBinary.serialize(doc);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 20);

  // Test O(1) Direct Field Extraction without parsing full doc
  const extractedUsername = FlashBinary.getField(buffer, 'username');
  const extractedScore = FlashBinary.getField(buffer, 'score');
  const extractedIsAdmin = FlashBinary.getField(buffer, 'isAdmin');
  const extractedNonExistent = FlashBinary.getField(buffer, 'non_existent_key');

  assert.strictEqual(extractedUsername, 'flash_master');
  assert.strictEqual(extractedScore, 98.75);
  assert.strictEqual(extractedIsAdmin, true);
  assert.strictEqual(extractedNonExistent, undefined);

  // Test Full Deserialization
  const deserialized = FlashBinary.deserialize(buffer);
  assert.deepStrictEqual(deserialized, doc);
});
