# Merkle State Roots & Tamper-Proofing

Even if data is encrypted, malicious actors or storage hardware failures could corrupt, delete, or inject bogus encrypted blocks.

FLASH DB integrates an authenticated **Merkle Tree State Engine (`FlashMerkle`)** directly into every collection.

---

## State Root Architecture

Every active document in a collection forms a leaf node in the collection's Merkle Tree:

```
                  [ Merkle Root (32-byte SHA-256) ]
                            /            \
                    [ Node H12 ]       [ Node H34 ]
                     /        \         /        \
                 [ Leaf 1 ] [ Leaf 2 ] [ Leaf 3 ] [ Leaf 4 ]
```

- **Deterministic Root:** Every mutation (insert, update, delete) updates the Merkle State Root.
- **Auditability:** The client can export or verify the collection state root against an external ledger or key-value blockchain.

---

## Cryptographic Proof Verification

A client can request a **Merkle Proof** for any individual document to mathematically prove that the record has not been altered:

```javascript
const users = await client.collection('users');

const doc = await users.insertOne({ name: 'Alice', email: 'alice@vault.io' });

// Verify Cryptographic Integrity Proof
const integrity = await users.verifyRecordIntegrity(doc.insertedId);

console.log(integrity);
/*
{
  isValid: true,
  docId: 'c7b508f6-...',
  root: '345caa5e1aab8f3ba55f91a55175b869791d2423b0730d95a55556bc0625dfaa',
  proofLength: 3
}
*/
```

If an attacker modifies even a single bit in the database files, `integrity.isValid` will immediately evaluate to `false`.
