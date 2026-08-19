/**
 * Adapter surface for AI frameworks (LangChain-style vector store + memory).
 */
export class FlashLangChainAdapter {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {object} [options]
   * @param {string} [options.ragCollection='langchain_rag']
   * @param {string} [options.memoryNamespace='langchain_memory']
   */
  constructor(client, options = {}) {
    this.client = client;
    this.rag = client.privateRAG(options.ragCollection || "langchain_rag");
    this.memory = client.agentMemory(options.memoryNamespace || "langchain_memory");
  }

  asVectorStore() {
    const rag = this.rag;
    return {
      engine: "FLASH",
      async addDocuments(docs) {
        const ids = [];
        for (const doc of docs) {
          const res = await rag.ingest({
            text: doc.pageContent || doc.text || String(doc),
            title: doc.metadata?.title,
            metadata: doc.metadata || {},
          });
          ids.push(res.parentId || res.chunkIds?.[0]);
        }
        return ids;
      },
      async similaritySearch(query, k = 4) {
        const result = await rag.ask(query, { topK: k });
        return result.sources.map((s) => ({
          pageContent: s.text,
          metadata: s.metadata || {},
        }));
      },
    };
  }

  asMemory() {
    const memory = this.memory;
    return {
      engine: "FLASH",
      async saveContext(input, output) {
        await memory.remember(`Q: ${input}\nA: ${output}`, {
          tags: ["conversation"],
          importance: 1.5,
        });
      },
      async loadMemoryVariables({ input }) {
        const recalled = await memory.recall(input, { topK: 5 });
        return {
          history: recalled.map((r) => r.content).join("\n"),
        };
      },
    };
  }
}
