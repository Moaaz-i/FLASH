# Key Hardening (`pqcHardened`)

FLASH can harden a passphrase with **scrypt → SHA3-256** before AES key use (`pqcHardened: true`).

This is **not** NIST ML-KEM / Kyber. Key agreement in `FlashPQC` uses **ECDH on secp256k1** plus SHA3-256. Treat it as extra passphrase stretching and classical ECDH — not post-quantum confidentiality.

---

## Enabling hardened key expansion

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: "long_passphrase_never_reused",
  pqcHardened: true,
});
```

---

## ECDH helpers (`FlashPQC`)

```javascript
import { FlashPQC } from "flash-zk";

const aliceKeys = FlashPQC.generateKeyPair();
const { sharedSecret, ciphertext } = FlashPQC.encapsulateSecret(
  aliceKeys.publicKey,
);
const decryptedSecret = FlashPQC.decapsulateSecret(
  ciphertext,
  aliceKeys.secretKey,
);

console.log("Secrets match:", sharedSecret.equals(decryptedSecret));
```
