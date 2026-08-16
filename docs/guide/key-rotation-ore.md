# Zero-Knowledge Key Rotation & Order-Revealing Encryption (ORE)

**FLASH DB** provides defense-in-depth cryptographic primitives for long-term database security and confidential range queries on encrypted ciphertexts.

---

## 1. Envelope Encryption & Key Rotation (`FlashKeyRotationManager`)

Envelope encryption uses a **Master Key (KEK - Key Encryption Key)** to govern versioned **Data Encryption Keys (DEKs)**.

Ciphertexts include their version envelope: `flash:v<version>:<iv>:<authTag>:<ciphertext>`.

### Features
* **Zero-Downtime Key Rotation**: Rotate keys seamlessly while older keys remain available for reading older records.
* **Lazy Re-encryption**: Documents are automatically re-encrypted with the latest active key during read/update operations.
* **Batch Migration**: Seamlessly re-encrypt millions of documents in background batches.

```javascript
import { FlashKeyRotationManager } from 'flash-db';

const keyManager = new FlashKeyRotationManager('master_quantum_secret_2026');

// 1. Encrypt with Version 1
const v1Cipher = keyManager.encrypt({ ssn: '000-12-3456', salary: 120000 });
console.log(v1Cipher); // 'flash:v1:a8f9...:b3c1...:90ef...'

// 2. Rotate to Version 2
keyManager.rotateKey();

// 3. Encrypt new document with Version 2
const v2Cipher = keyManager.encrypt({ ssn: '000-98-7654', salary: 95000 });
console.log(v2Cipher); // 'flash:v2:77da...:44ea...:55fb...'

// 4. Decrypt both seamlessly
console.log(keyManager.decrypt(v1Cipher)); // { ssn: '000-12-3456', salary: 120000 }
console.log(keyManager.decrypt(v2Cipher)); // { ssn: '000-98-7654', salary: 95000 }

// 5. Check if a record requires re-encryption
if (keyManager.needsReEncryption(v1Cipher)) {
  const upgradedCipher = keyManager.reEncrypt(v1Cipher);
  console.log(upgradedCipher); // Now upgraded to 'flash:v2:...'!
}
```

---

## 2. Order-Revealing Encryption (`FlashORE`)

**FlashORE** enables servers to evaluate comparison and range operators (`$gt`, `$gte`, `$lt`, `$lte`, `$between`) **directly over encrypted ciphertext tokens without decrypting the underlying numbers or dates**.

### How It Works

1. The client SDK encrypts numbers into ORE tokens before sending them to the database.
2. The server compares ORE tokens in constant $O(1)$ time to filter records.
3. The server never learns the plaintext numbers, account balances, or timestamps!

```javascript
import { FlashORE } from 'flash-db';

const ore = new FlashORE('secret_field_prf_key');

// Encrypt plain values on the client side
const oreSalaryMin = ore.encrypt(50000, 'salary');
const oreSalaryMax = ore.encrypt(100000, 'salary');
const oreDocSalary = ore.encrypt(75000, 'salary');

// Server-side Range Evaluation (Without decrypting!)
const matches = FlashORE.matchesRange(oreDocSalary, {
  $gt: oreSalaryMin,
  $lt: oreSalaryMax
});

console.log(matches); // true!

// Direct Token Comparison
console.log(FlashORE.compare(oreSalaryMin, oreSalaryMax)); // -1 (Min < Max)
```
