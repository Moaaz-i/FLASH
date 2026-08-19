import crypto from "node:crypto";
import { flashEmbed } from "./embeddings.mjs";
import { FlashContextOptimizer } from "./context_optimizer.mjs";

/**
 * Embedding-only vault — server stores vectors + content hashes only.
 * Plaintext stays client-side (never written to the engine).
 */
export class FlashEmbeddingVault {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} [collectionName='embedding_vault']
   * @param {object} [options]
   */
  constructor(client, collectionName = "embedding_vault", options = {}) {
    this.client = client;
    this.col = client.collection(collectionName);
    this.dimensions = options.dimensions ?? 64;
    /** @type {Map<string, string>} client-side text cache */
    this._textCache = new Map();
    this.stats = { ingested: 0, queries: 0 };
  }

  async ingest(text, metadata = {}) {
    await this.col.init();
    const id = metadata.id || crypto.randomUUID();
    const contentHash = crypto.createHash("sha256").update(text).digest("hex");
    const embedding = flashEmbed(text, this.dimensions);

    this._textCache.set(String(id), text);

    await this.col.insertOne({
      _id: id,
      contentHash,
      title: metadata.title || "",
      tags: metadata.tags || [],
      $vector: Array.from(embedding),
      _textOnServer: false,
    });

    this.stats.ingested++;
    return { id, contentHash, serverStoredPlaintext: false };
  }

  async ask(question, options = {}) {
    await this.col.init();
    this.stats.queries++;
    const vec = flashEmbed(question, this.dimensions);
    const hits = await this.col.vectorSearch({
      vector: Array.from(vec),
      topK: options.topK ?? 8,
    });

    const docs = hits.map((h) => {
      const text = this._textCache.get(String(h._id)) || "";
      return {
        id: String(h._id),
        text,
        contentHash: h.contentHash,
        metadata: { title: h.title, tags: h.tags },
        score: h._score ?? 0,
        rehydratedClientSide: true,
      };
    });

    const optimized = FlashContextOptimizer.optimizeTokenBudget(docs, {
      maxTokens: options.maxTokens ?? 1500,
    });

    return {
      question,
      contextPack: optimized.packedContext,
      sources: optimized.documentsUsed,
      serverSawPlaintext: false,
    };
  }

  exportTextCache() {
    return Object.fromEntries(this._textCache);
  }

  importTextCache(map) {
    for (const [k, v] of Object.entries(map || {})) {
      this._textCache.set(k, v);
    }
  }
}
