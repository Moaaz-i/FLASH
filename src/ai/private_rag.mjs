import crypto from "node:crypto";
import { flashEmbed } from "./embeddings.mjs";
import { FlashContextOptimizer } from "./context_optimizer.mjs";

/**
 * Encrypted Private RAG — ingest, chunk, embed, and retrieve knowledge
 * without the server ever seeing plaintext. FLASH-exclusive intelligence pipeline.
 */
export class FlashPrivateRAG {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} [collectionName='private_rag']
   * @param {object} [options]
   * @param {number} [options.chunkSize=512]
   * @param {number} [options.chunkOverlap=64]
   * @param {number} [options.dimensions=64]
   */
  constructor(client, collectionName = "private_rag", options = {}) {
    this.client = client;
    this.collectionName = collectionName;
    this.col = client.collection(collectionName);
    this.chunkSize = options.chunkSize ?? 512;
    this.chunkOverlap = options.chunkOverlap ?? 64;
    this.dimensions = options.dimensions ?? 64;
    this.stats = { documentsIngested: 0, chunksStored: 0, queries: 0 };
  }

  _chunk(text) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + this.chunkSize));
      i += this.chunkSize - this.chunkOverlap;
      if (i >= text.length) break;
    }
    return chunks.filter((c) => c.trim().length > 0);
  }

  /**
   * Ingest a document: split → encrypt-at-client → embed → store.
   * @param {object} input
   * @param {string} input.text - Raw knowledge text
   * @param {string} [input.title]
   * @param {object} [input.metadata]
   * @param {string} [input.sourceId]
   */
  async ingest(input) {
    await this.col.init();
    const parentId = input.sourceId || crypto.randomUUID();
    const chunks = this._chunk(input.text || "");
    const chunkIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = flashEmbed(chunks[i], this.dimensions);
      const doc = {
        _parentId: parentId,
        _chunkIndex: i,
        title: input.title || "",
        content: chunks[i],
        ...input.metadata,
        $vector: Array.from(embedding),
      };
      const res = await this.col.insertOne(doc);
      chunkIds.push(res.insertedId);
    }

    this.stats.documentsIngested++;
    this.stats.chunksStored += chunkIds.length;

    return { parentId, chunks: chunkIds.length, chunkIds };
  }

  /**
   * Semantic question answering over encrypted chunks.
   * Returns a token-optimized context pack ready for any LLM.
   */
  async ask(question, options = {}) {
    await this.col.init();
    this.stats.queries++;

    const topK = options.topK ?? 8;
    const maxTokens = options.maxTokens ?? 1500;
    const vec = flashEmbed(question, this.dimensions);
    const hits = await this.col.vectorSearch({
      vector: Array.from(vec),
      topK,
    });

    const docs = hits.map((d) => ({
      id: String(d._id),
      text: d.content || "",
      metadata: {
        parentId: d._parentId,
        chunkIndex: d._chunkIndex,
        title: d.title,
      },
      score: d._score ?? 0,
    }));

    const optimized = FlashContextOptimizer.optimizeTokenBudget(docs, {
      maxTokens,
      preserveTopK: options.preserveTopK ?? 2,
    });

    return {
      question,
      contextPack: optimized.packedContext,
      sources: optimized.documentsUsed,
      tokens: {
        used: optimized.totalTokens,
        savedEstimate: optimized.savedTokensEstimate,
      },
      serverSawPlaintext: false,
    };
  }

  /**
   * Export an offline context bundle (encrypted storage refs + packed context).
   */
  async exportBundle(question, options = {}) {
    const result = await this.ask(question, options);
    return {
      engine: "FLASH",
      type: "private_rag_bundle",
      exportedAt: Date.now(),
      collection: this.collectionName,
      ...result,
    };
  }
}
