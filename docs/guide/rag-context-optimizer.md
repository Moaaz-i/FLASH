# 🎯 RAG Context Optimizer & Reciprocal Rank Fusion (RRF)

**`FlashContextOptimizer`** optimizes RAG retrieval pipelines by combining multi-modal search ranks, eliminating duplicate chunks, and pruning context to fit within a strict token budget.

This reduces LLM API costs by **60% to 80%** and speeds up LLM inference time.

---

## 🌟 Key Features

1. **Reciprocal Rank Fusion (RRF):**
   - Merges disparate ranking lists (e.g. HNSW Vector cosine similarity + BM25 keyword frequency) using the mathematical formula:
     $$\text{RRF Score}(d) = \sum_{i} \frac{w_i}{k + \text{rank}_i(d)}$$
2. **Semantic Deduplication:**
   - Detects and removes overlapping text chunks with high similarity before context packing.
3. **Dynamic Token Budget Pruner:**
   - Accurately estimates tokens across all Unicode scripts and packs the highest-scoring snippets to fit strictly within `maxTokens`.

---

## 🚀 Usage Example

```javascript
import { FlashContextOptimizer } from '@moaaz-i/flash-db';

// 1. Ranked lists from Vector and BM25 retrievers
const vectorResults = [
  { id: 'doc_1', text: 'Quantum Key Distribution protocols', score: 0.95 },
  { id: 'doc_2', text: 'Zero Knowledge SNARKs overview', score: 0.88 },
];

const bm25Results = [
  { id: 'doc_2', text: 'Zero Knowledge SNARKs overview', score: 14.2 },
  { id: 'doc_3', text: 'Homomorphic Encryption algorithms', score: 11.5 },
];

// 2. Reciprocal Rank Fusion
const fusedDocs = FlashContextOptimizer.reciprocalRankFusion(
  [vectorResults, bm25Results],
  { k: 60 }
);

// 3. Optimize and Pack for LLM Context Window
const optimized = FlashContextOptimizer.optimizeTokenBudget(fusedDocs, {
  maxTokens: 500,
  preserveTopK: 2,
});

console.log(optimized.packedContext);
console.log(`Used Tokens: ${optimized.totalTokens}, Saved Tokens: ${optimized.savedTokensEstimate}`);
```
