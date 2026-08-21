# ⚡ Multi-Tier AI Semantic LLM Response Cache

**`FlashSemanticCache`** is a high-speed multi-tier semantic vector cache designed for Large Language Models (OpenAI, Gemini, Anthropic, DeepSeek, Ollama).

It answers semantically equivalent queries in **`< 0.05 ms`**, slashing LLM API costs and token usage by up to **90%**.

---

## 🏛️ Multi-Tier Architecture (L1 RAM + L2 LSM Disk)

Traditional semantic caches store all entries exclusively in RAM, quickly running out of memory as query volume grows.

FLASH solves this with a **Dual-Tier Cache**:
- **L1 Hot Cache (In-Memory HNSW)**: Sub-millisecond (`< 0.05ms`) immediate lookup.
- **L2 Persistent Disk Cache (LSM-Tree / SSTables)**: Persists millions of historical prompt-response pairs to disk with Zero RAM bloat. Automatically promotes hot entries back to L1 on cache hit.

```
Incoming Prompt ──► [L1 In-Memory HNSW] ──(Hit <0.05ms)──► Instant Reply
                           │
                         (Miss)
                           ▼
                    [L2 LSM-Tree Disk]   ──(Hit <1.5ms)──► Promote to L1 & Reply
                           │
                         (Miss)
                           ▼
                    [Call LLM API]       ──► Store in L1 + Persist to L2 Disk
```

---

## 🚀 Quick Example

```javascript
import { FlashSemanticCache, FlashDatabase } from 'flash-db';

const db = new FlashDatabase('ai_cache_db');
const cacheCollection = db.collection('semantic_cache_l2');

const cache = new FlashSemanticCache({
  similarityThreshold: 0.92,  // 92% semantic similarity threshold
  maxEntries: 10000,          // Max L1 in-memory entries
  ttlMs: 86400000,            // 24 hours TTL
  l2Collection: cacheCollection, // L2 Persistent Disk Collection
});

// 1. Cache a prompt response with its vector embedding
const embedding = [0.012, 0.450, 0.880, /* ... */];
await cache.set(
  'What is zero-knowledge encryption?',
  embedding,
  { answer: 'Zero-knowledge encryption ensures the server never sees plaintext keys or data.' }
);

// 2. Query with a semantically similar prompt embedding
const similarQueryEmbedding = [0.013, 0.448, 0.882, /* ... */];
const match = await cache.getAsync(similarQueryEmbedding, 'Explain zero knowledge encryption');

if (match && match.hit) {
  console.log(`Cache Hit (${match.tier})! Similarity: ${(match.similarity * 100).toFixed(1)}%`);
  console.log(match.response.answer);
}
```

---

## 📊 Live Cache Statistics

```javascript
console.log(cache.getStats());
// {
//   l1Size: 850,
//   l1Hits: 12400,
//   l2Hits: 3200,
//   totalHits: 15600,
//   misses: 850,
//   hitRatio: 0.948
// }
```
