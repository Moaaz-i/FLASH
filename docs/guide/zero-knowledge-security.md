# Zero-Knowledge Security & Blind Indexing

In traditional databases, database administrators, hosting providers, or memory-dump attackers can easily view all plaintext data stored in RAM and disk.

**FLASH DB operates on a 100% Zero-Trust / Zero-Knowledge security model:**
The database engine and physical storage never receive unencrypted plaintext or decryption keys.

---

## The Cryptographic Primitives

### 1. Document & Field Encryption (`FlashCipher`)

- **Algorithm:** Authenticated `AES-256-GCM` with 96-bit randomized Nonces (IVs) and 128-bit authentication tags.
- **Key Derivation:** Master secret keys are derived using `PBKDF2-HMAC-SHA256` with 100,000 rounds and a **dynamically generated unique database-specific salt** (stored securely in `.flash-salt` per-database). Master secret passphrases of any length are automatically hardened and derived, rather than being used directly as raw AES keys.
- **Envelope Layout:** `[ IV (12 bytes) | AuthTag (16 bytes) | Ciphertext (N bytes) ]` encoded as Base64.

---

## 2. Blind Indexing & Searchable Encryption

How can a database find records if it cannot decrypt the data?

FLASH DB implements **Searchable Symmetric Encryption (SSE)** using salted HMAC cryptographic trapdoors:

### Exact Matches (`$eq`, `$in`)

```
Trapdoor = HMAC-SHA256(SecretKey, "exact:" + FieldName + ":" + Value)
```

- The client hashes the search value into a 64-character hex token.
- The server searches its in-memory Blind Index map for this hex token.
- The server matches the record without ever knowing what value was searched for!

::: security Deterministic Encryption
For situations requiring exact matching where deterministic encryption is preferred, FLASH utilizes **`AES-256-CBC` with synthetic HMAC-based IVs** rather than AES-GCM deterministic mode, eliminating any risks associated with GCM nonce-reuse (which would compromise the master key if a synthetic nonce ever collided).
:::

### Substring & Regex Queries (`$regex`)

For partial text search:

1. The text is broken down into **3-Gram Substrings**.
2. Each 3-gram is hashed into an HMAC token.
3. The server computes the set intersection of matching documents.

::: warning Regular Expression Sandboxing (ReDoS Prevention)
To prevent Regular Expression Denial of Service (ReDoS) resource exhaustion attacks (where a malicious pattern causes exponential backtracking), `$regex` evaluations on the server are executed in a secure Node.js `vm` sandbox with a strict **50ms execution timeout**.
:::

### Honey Padding (Defense Against Frequency Leakage)

To prevent statistical frequency analysis attacks (where an attacker analyzes token repetition counts):

- FLASH injects randomized, pseudo-deterministic dummy noise tokens (**Honey Padding**).
- This masks the token distribution and document length profiles from attackers.

---

## 3. Bucketed Range Indexing (`$gt`, `$lt`)

Continuous numerical fields (like `age`, `balance`, or `timestamps`) are partitioned into discrete, salt-hashed buckets:

```
BucketIndex = floor(Value / BucketSize)
BucketToken = HMAC-SHA256(SecretKey, "bucket:" + FieldName + ":" + BucketIndex)
```

When querying `{ balance: { $gte: 1000, $lte: 5000 } }`:

- The client SDK computes the tokens covering buckets from index `100` to `500`.
- The server returns the union of matching candidate documents.
- The client SDK decrypts and performs the final sub-bucket precision filter.

---

## 4. AAD Field Binding (Anti-Swap Protection)

Since v2, FLASH DB binds each ciphertext to its **record ID** and **field name** using Additional Authenticated Data (AAD):

```
Ciphertext = AES-256-GCM(Key, Nonce, Plaintext, AAD = "recordId:fieldName")
```

### Why This Matters

Without AAD, an attacker could **swap ciphertext between records** and the database wouldn't notice:

```
# Without AAD (v1) — vulnerable to ciphertext swapping
user-1.name ciphertext → pasted into user-2.name → decrypts successfully ✗

# With AAD (v2) — ciphertext is bound to the record
user-1.name ciphertext (AAD="user-1:name") → pasted into user-2.name
→ AAD mismatch → decryption FAILS ✓
```

### How It Works

1. **Encrypt:** Each field gets AAD = `{recordId}:{fieldName}`
2. **Payload format (v2):**
   ```
   [0xF44C4532] [length bytes] [12-byte nonce] [ciphertext + 16-byte auth tag]
   ```
3. **Decrypt:** The AAD is verified — if the ciphertext was moved to a different record or field, decryption fails with an authentication error.
4. **Legacy support:** v1 payloads (without the `0xF44C4532` magic prefix) are detected and decrypted transparently without AAD verification. No migration needed.

### Tenant Key Isolation

When using multi-tenancy (`client.tenant(tenantId)`), keys are derived as:

```
TenantKey = HMAC-SHA256(MasterKey, dbName + tenantId + version)
```

This ensures that:

- Each tenant's data is encrypted with a **unique key**
- A compromised tenant key cannot decrypt other tenants' data
- Key rotation is supported per-tenant

```js
const orgA = client.tenant("org-a");
const orgB = client.tenant("org-b");

// org-a's key cannot decrypt org-b's data, and vice versa
```

### Quantum-Resistant Hardening

Enable PQC-hardened key derivation for post-quantum protection:

```js
const client = new FlashClient({
  secretKey: "master-key",
  pqcHardened: true, // Uses FlashPQC.deriveQuantumHardenedKey()
});
```
