# Fast AI Vector Search with HNSW Graph Index

**FLASH DB** features an integrated **HNSW (Hierarchical Navigable Small World)** vector index engine (`FlashHNSWIndex`), bringing ultra-fast $O(\log N)$ Approximate Nearest Neighbor (ANN) search to AI Vector Embeddings, LLM Context Retrieval, and Private RAG (Retrieval-Augmented Generation).

---

## Why HNSW over Linear Scan?

| Feature | Exact Linear Scan | FLASH HNSW Engine |
| :--- | :--- | :--- |
| **Search Time Complexity** | $O(N)$ linear | **$O(\log N)$ logarithmic** |
| **Throughput on 1M Vectors** | ~10 QPS | **~5,000+ QPS** |
| **Memory Layout** | Flat Array | **Multi-Layer Graph Hierarchies** |
| **Distance Metrics** | Cosine / L2 | **Cosine, Euclidean (L2), Inner Product (Dot)** |
| **Zero-Knowledge RAG** | Supported | **Fully Compatible with Client-Side Encryption** |

---

## Multi-Layer Graph Architecture

```
Layer 3 (Express):    [Node A] --------------------> [Node D]
                           \                              \
Layer 2:              [Node A] ---------> [Node C] -> [Node D]
                           \                   \          \
Layer 1:              [Node A] -> [Node B] -> [Node C] -> [Node D]
                           \          \          \          \
Layer 0 (Dense):      [All Indexed Document Embeddings & Nearest Neighbors]
```

At upper layers, searches make large leaps across vector space with minimal distance computations, before descending to Layer 0 to perform fine-grained beam searches.

---

## Quick Usage Example

### 1. Standalone `FlashHNSWIndex`

```javascript
import { FlashHNSWIndex } from '@moaaz-i/flash-db';

// 1. Initialize HNSW Index
const hnsw = new FlashHNSWIndex({
  M: 16,               // Max outgoing connections per node
  efConstruction: 64,  // Candidate list size during insertion
  efSearch: 32,        // Search beam width
  metric: 'cosine'     // 'cosine' | 'euclidean' | 'dot'
});

// 2. Insert High-Dimensional Vector Embeddings (e.g. OpenAI / Cohere 1536-dim)
hnsw.insert('doc_article_1', [0.014, -0.052, 0.841, /* ... */]);
hnsw.insert('doc_article_2', [0.019, -0.048, 0.820, /* ... */]);
hnsw.insert('doc_article_3', [-0.912, 0.120, 0.041, /* ... */]);

// 3. Perform Fast K-Nearest Neighbors (KNN) Search
const queryVector = [0.015, -0.050, 0.835, /* ... */];
const topMatches = hnsw.search(queryVector, 5);

console.log(topMatches);
// [
//   { docId: 'doc_article_1', distance: 0.0012, score: 0.9988 },
//   { docId: 'doc_article_2', distance: 0.0145, score: 0.9855 }
// ]
```

---

### 2. Integrated with `FlashVectorIndex`

```javascript
import { FlashVectorIndex } from '@moaaz-i/flash-db';

const vectorIndex = new FlashVectorIndex({
  engine: 'hnsw',
  hnswOptions: { M: 16, efSearch: 32 }
});

vectorIndex.set('user_profile_1', [0.12, 0.45, 0.88]);
const results = vectorIndex.search([0.10, 0.44, 0.90], 3);
```

---

## Filtering and Metadata Candidates

HNSW supports dynamic metadata filtering, allowing you to restrict vector search candidates to specific pre-filtered document IDs:

```javascript
const candidateFilter = new Set(['doc_article_1', 'doc_article_5']);
const filteredResults = hnsw.search(queryVector, 5, {
  filter: candidateFilter
});
```
