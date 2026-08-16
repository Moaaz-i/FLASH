import test from 'node:test';
import assert from 'node:assert';
import { FlashCipher } from '../src/crypto/cipher.mjs';
import { FlashBlindIndex } from '../src/crypto/blind_index.mjs';
import { FlashHomomorphic } from '../src/crypto/homomorphic.mjs';
import { FlashMerkle } from '../src/crypto/merkle.mjs';

test('FlashCipher - Encryption & Decryption with AES-256-GCM', () => {
  const secretKey = 'super_secret_master_key_32_bytes!';
  const cipher = new FlashCipher(secretKey);

  const originalDoc = { name: 'Alice', balance: 5000, secretNote: 'Zero-Knowledge 2026' };
  const encrypted = cipher.encrypt(originalDoc);

  assert.strictEqual(typeof encrypted, 'string');
  assert.notStrictEqual(encrypted, JSON.stringify(originalDoc));

  const decrypted = cipher.decrypt(encrypted, true);
  assert.deepStrictEqual(decrypted, originalDoc);
});

test('FlashBlindIndex - Exact match and N-gram trapdoors with Honey padding', () => {
  const blindIndex = new FlashBlindIndex('blind_index_secret_key');

  const trapdoor1 = blindIndex.generateTrapdoor('email', 'admin@flashdb.io');
  const trapdoor2 = blindIndex.generateTrapdoor('email', 'admin@flashdb.io');
  const trapdoor3 = blindIndex.generateTrapdoor('email', 'other@flashdb.io');

  assert.strictEqual(trapdoor1, trapdoor2, 'Identical inputs must produce identical trapdoors');
  assert.notStrictEqual(trapdoor1, trapdoor3, 'Different inputs must produce different trapdoors');

  const ngrams = blindIndex.generateNGramTrapdoors('name', 'Alexander', true);
  assert.ok(ngrams.length >= 6, 'Should generate ngrams with honey padding');
});

test('FlashHomomorphic - Additive encryption and server-side aggregation without decryption', () => {
  const homo = new FlashHomomorphic('homomorphic_secret_key');

  const c1 = homo.encryptAdd(150.50, 'doc1', 'salary');
  const c2 = homo.encryptAdd(250.25, 'doc2', 'salary');
  const c3 = homo.encryptAdd(100.00, 'doc3', 'salary');

  // Server aggregates ciphertexts blindly
  const serverAggregatedCiphertext = homo.aggregateSum([c1.ciphertext, c2.ciphertext, c3.ciphertext]);
  assert.strictEqual(typeof serverAggregatedCiphertext, 'string');

  // Client decrypts final sum
  const plainSum = homo.decryptSum(serverAggregatedCiphertext, [
    { recordId: 'doc1', fieldName: 'salary' },
    { recordId: 'doc2', fieldName: 'salary' },
    { recordId: 'doc3', fieldName: 'salary' }
  ]);

  assert.strictEqual(plainSum, 500.75);
});

test('FlashMerkle - Tree root and Tamper-Proof Cryptographic Verification', () => {
  const leafHashes = [
    FlashMerkle.hash('record_1').toString('hex'),
    FlashMerkle.hash('record_2').toString('hex'),
    FlashMerkle.hash('record_3').toString('hex'),
    FlashMerkle.hash('record_4').toString('hex')
  ];

  const tree = new FlashMerkle(leafHashes);
  const root = tree.getRoot();
  assert.ok(root && root.length === 64, 'Merkle root must be a 32-byte (64 hex char) SHA-256 hash');

  const proof = tree.getProof(2);
  const isValid = FlashMerkle.verifyProof(leafHashes[2], proof, root);
  assert.strictEqual(isValid, true, 'Valid proof must verify successfully');

  const isTampered = FlashMerkle.verifyProof(FlashMerkle.hash('fake_record').toString('hex'), proof, root);
  assert.strictEqual(isTampered, false, 'Tampered data must fail verification');
});
