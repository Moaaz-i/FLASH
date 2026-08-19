# Private RAG & Agent Memory

---

## FlashPrivateRAG

Full encrypted RAG pipeline: chunk → encrypt → embed → semantic retrieve → token-optimized context pack.

```javascript
const rag = client.privateRAG('knowledge', {
  chunkSize: 512,
  chunkOverlap: 64,
});

await rag.ingest({
  title: 'Security Model',
  text: 'FLASH encrypts all documents client-side...',
  metadata: { category: 'docs' },
});

const result = await rag.ask('Does the server see plaintext?', {
  topK: 8,
  maxTokens: 1500,
});

console.log(result.contextPack);      // LLM-ready context
console.log(result.serverSawPlaintext); // false
console.log(result.sources);          // matched chunks
```

### `exportBundle(question)`

Export an offline context bundle for external LLM pipelines.

---

## FlashEmbeddingVault

Stores **only vectors + content hashes** on the engine. Plaintext never touches disk on the server path — it lives in a client-side cache.

```javascript
const vault = client.embeddingVault('vectors');
await vault.ingest('Secret research notes...', { title: 'R&D' });

const answer = await vault.ask('research findings');
// Rehydrates text from client-side cache

// Persist text cache alongside .flashpack exports
const cache = vault.exportTextCache();
```

---

## FlashAgentMemory

Encrypted episodic memory for AI agents with semantic recall, TTL, and importance weighting.

```javascript
const memory = client.agentMemory('my-bot', {
  defaultTtlMs: 7 * 86400000, // 7 days
});

await memory.remember('User prefers dark mode', {
  tags: ['preference'],
  importance: 2,
});

const recalled = await memory.recall('UI preferences', { topK: 5 });
await memory.forget(memoryId);
await memory.pruneExpired();
```

---

## FlashMultiAgentSync

Multiple agents sharing encrypted memory namespace.

```javascript
const sync = client.multiAgentSync('team');
sync.registerAgent('researcher');
sync.registerAgent('writer');

await sync.share('researcher', 'Hypothesis A is supported by data X');
const ctx = await sync.getSharedContext('hypothesis');
```

---

## FlashLangChainAdapter

Adapter surface for AI frameworks:

```javascript
const lc = client.langChainAdapter({
  ragCollection: 'langchain_rag',
  memoryNamespace: 'langchain_memory',
});

const vectorStore = lc.asVectorStore();
await vectorStore.addDocuments([{ pageContent: '...', metadata: {} }]);
const docs = await vectorStore.similaritySearch('query', 4);

const mem = lc.asMemory();
await mem.saveContext('question', 'answer');
const vars = await mem.loadMemoryVariables({ input: 'question' });
```
