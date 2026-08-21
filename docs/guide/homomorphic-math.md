# Homomorphic Math & Encrypted Counters

One of the greatest limitations of traditional encrypted databases is the inability to compute mathematical aggregates (`SUM`, `AVG`, `INC`) without sending all records back to the client or decrypting on the server.

**FLASH DB solves this using Additive Homomorphic Masked Groups (`FlashHomomorphic`).**

---

## How Additive Homomorphism Works

When a numerical field (e.g. `balance`, `salary`, `score`) is configured as a `counter` policy:

### 1. Client-Side Additive Encryption
For each document:
$$C_i = (M_i + \text{Mask}(RecordId, FieldName)) \pmod P$$
Where:
- $M_i$ is the plaintext integer or float (scaled by $10^2$).
- $\text{Mask}$ is a cryptographically derived pseudorandom offset known only to the client.
- $P$ is a large 64-bit safe prime modulus ($2^{64} - 59$).

### 2. Server-Side Blind Aggregation
The server can add thousands of encrypted balances together without decrypting any of them:
$$C_{\text{total}} = \sum_{i=1}^{N} C_i \pmod P$$

### 3. Client-Side Decryption of Final Result
The client receives only the aggregated ciphertext $C_{\text{total}}$:
$$\text{PlainSum} = \left( C_{\text{total}} - \sum_{i=1}^{N} \text{Mask}_i \right) \pmod P$$

---

## Usage Example

### 1. Declare Field Policy as `'counter'`

```javascript
import { FlashClient } from '@moaaz-i/flash-db';

const client = new FlashClient({
  secretKey: 'master-key',
  fieldPolicy: {
    balance: 'counter'
  }
});

const accounts = await client.collection('accounts');

await accounts.insertMany([
  { accountId: 'ACC-01', balance: 1500.50 },
  { accountId: 'ACC-02', balance: 2400.25 },
  { accountId: 'ACC-03', balance: 900.00 }
]);
```

### 2. Run Aggregations

```javascript
const stats = await accounts.aggregate([
  {
    $group: {
      _id: null,
      totalBalance: { $sum: '$balance' }
    }
  }
]);

console.log(stats[0].totalBalance); // 4800.75
```
