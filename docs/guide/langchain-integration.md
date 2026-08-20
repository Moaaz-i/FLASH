# LangChain & AI Framework Integration

FLASH ships **`FlashLangChainAdapter`** — a LangChain-style surface for encrypted vector storage and agent memory without exposing plaintext to the engine.

---

## Installation

```bash
npm install @moaaz-yahia-zakaria/flash-db
```

---

## Quick Start

```javascript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({
  secretKey: process.env.FLASH_MASTER_KEY,
  storagePath: "./flash_data",
});

const adapter = client.langChainAdapter({
  ragCollection: "my_knowledge",
  memoryNamespace: "my_agent",
});

const vectorStore = adapter.asVectorStore();
const memory = adapter.asMemory();
```

---

## Vector Store

Compatible with LangChain-style `addDocuments` / `similaritySearch`:

```javascript
await vectorStore.addDocuments([
  {
    pageContent: "FLASH is a server-blind encrypted intelligence database.",
    metadata: { source: "docs" },
  },
  {
    pageContent: "Private RAG ingests client-side and searches by embedding similarity.",
    metadata: { source: "docs" },
  },
]);

const docs = await vectorStore.similaritySearch("server blind storage", 3);
console.log(docs.map((d) => d.pageContent));
```

Under the hood: `FlashPrivateRAG` with encrypted ingest and HNSW search.

---

## Conversation Memory

```javascript
await memory.saveContext(
  "What language does the user prefer?",
  "The user prefers Arabic UI.",
);

const vars = await memory.loadMemoryVariables({
  input: "language preference",
});
console.log(vars.history);
```

Under the hood: `FlashAgentMemory` with semantic recall.

---

## Wiring to LangChain (conceptual)

```javascript
// Pseudocode — adapt to your LangChain version
import { ChatOpenAI } from "@langchain/openai";
import { RetrievalQAChain } from "langchain/chains";

const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

// Use FLASH vector store as retriever
const retriever = {
  getRelevantDocuments: (q) => vectorStore.similaritySearch(q, 4),
};

// Chain: FLASH retrieves encrypted context → LLM generates answer client-side
```

::: warning
The LLM call is **your responsibility**. FLASH retrieves context; it does not send data to OpenAI automatically.
:::

---

## Local LLM Pattern

Keep the full pipeline on-device:

```
Documents → FLASH Private RAG (encrypted)
Question  → FLASH similaritySearch → context chunks
Context   → Ollama / llama.cpp / local model → answer
```

No cloud vector DB. No plaintext at rest on disk.

---

## Engine Tuning for RAG Ingest

Bulk document ingest benefits from batch durability:

```javascript
const client = new FlashClient({
  secretKey: "key",
  engineOptions: {
    durability: "balanced",
  },
});

// Prefer batch inserts when loading many chunks
await client.collection("chunks").insertMany(docs);
```

---

## Related

- [Private RAG & Agent Memory](/guide/private-rag)
- [FLASH-Exclusive Stack](/guide/flash-exclusive)
- [Examples: private-rag-cli](https://github.com/Moaaz-i/FLASH/tree/main/examples/private-rag-cli)
