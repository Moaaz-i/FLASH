# Post-Quantum Cryptography (PQC)

Quantum computers pose a severe future threat to classical public-key cryptography. FLASH DB integrates **Post-Quantum Cryptography (PQC)** principles inspired by the latest NIST quantum-resistant standards (**ML-KEM / Kyber & SHA3 / SHAKE-256**).

---

## 1. Enabling Quantum-Hardened Key Expansion

To initialize a client with post-quantum key derivation:

```javascript
import { FlashClient } from '@moaaz-i/flash-db';

const client = new FlashClient({
  secretKey: 'quantum_resilient_passphrase_2026',
  pqcHardened: true // Activates SHA3-512 Quantum Sponge Key Expansion
});
```

---

## 2. Using the PQC Engine Directly (`FlashPQC`)

FLASH DB exports low-level lattice key exchange utilities:

```javascript
import { FlashPQC } from '@moaaz-i/flash-db';

// 1. Generate Quantum-Resistant Key Pair (64-byte Seed expanded via SHA3-512)
const aliceKeys = FlashPQC.generateKeyPair();
console.log('Public Key (128 hex chars):', aliceKeys.publicKey);

// 2. Encapsulate Shared Secret against Public Key
const { sharedSecret, ciphertext } = FlashPQC.encapsulateSecret(aliceKeys.publicKey);

// 3. Decapsulate Shared Secret using Secret Key
const decryptedSecret = FlashPQC.decapsulateSecret(ciphertext, aliceKeys.secretKey);

console.log('Secrets Match:', sharedSecret.equals(decryptedSecret)); // true
```
