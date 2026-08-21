# Encrypted Fuzzy & Phonetic Search

In traditional databases, fuzzy search on encrypted data was considered impossible. **FLASH DB changes this by introducing Zero-Knowledge Levenshtein Edit Distance and Soundex Phonetic matching.**

---

## 1. Typo-Tolerant Fuzzy Search (`$fuzzy`)

Search records even when user queries have spelling mistakes or typos:

```javascript
import { FlashClient } from 'flash-zk';

const client = new FlashClient({ secretKey: 'master_key' });
const users = client.collection('users');

// User typed "Alen Turing" with a typo
const results = await users.find({
  name: { $fuzzy: 'Alen Turing', maxDistance: 1 }
});

console.log(results[0].name); // 'Alan Turing'
```

---

## 2. Phonetic Soundex Matching (`$soundex`)

Find records that sound identical phonetically regardless of spelling differences:

```javascript
// Finds 'Alan Turing' or 'Allan Turing'
const matches = await users.find({
  name: { $soundex: 'Allan Turing' }
});
```
