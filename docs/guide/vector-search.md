# Encrypted AI Vector Search & Private RAG

With the explosion of Generative AI and Large Language Models (LLMs), Vector Databases have become essential. However, traditional vector databases store embeddings in cleartext, creating immense data leak risks.

**FLASH DB provides native Vector Semantic Search directly on encrypted documents for 100% Private RAG (Retrieval-Augmented Generation).**

---

## 1. Storing Vector Embeddings (`$vector`)

When inserting a document, simply supply a numerical embedding array in the `$vector` field:

```javascript
import { FlashClient } from '@moaaz-yahia-zakaria/flash-db';

const client = new FlashClient({ secretKey: 'ai_master_key' });
const articles = client.collection('articles');

// Insert document with an OpenAI / Gemini / Ollama vector embedding
await articles.insertOne({
  title: 'Quantum Key Distribution & Zero Knowledge',
  category: 'cybersecurity',
  content: 'Sensitive intelligence report...',
  $vector: [0.124, 0.892, -0.451, 0.038, 0.771] // Arbitrary dimension array
});
```

---

## 2. Performing Similarity Search (`vectorSearch`)

You can query nearest neighbors using Cosine Similarity, with optional metadata filters:

```javascript
// Query embedding generated from user prompt
const queryVector = [0.119, 0.885, -0.440, 0.040, 0.760];

const similarReports = await articles.vectorSearch({
  vector: queryVector,
  topK: 3,                                // Number of top results
  filter: { category: 'cybersecurity' }   // Optional metadata filter
});

console.log(similarReports);
```

### Output:
```json
[
  {
    "_id": "f8a92b...",
    "title": "Quantum Key Distribution & Zero Knowledge",
    "category": "cybersecurity",
    "content": "Sensitive intelligence report...",
    "_score": 0.9984
  }
]
```
The resulting `_score` is the normalized Cosine Similarity (ranging from `0.0` to `1.0`).
