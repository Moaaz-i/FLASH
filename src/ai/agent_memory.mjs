import crypto from "node:crypto";
import { flashEmbed } from "./embeddings.mjs";

/**
 * Encrypted episodic memory for AI agents — remember facts, recall by meaning,
 * decay by time and importance. Server-blind semantic agent memory.
 */
export class FlashAgentMemory {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} [namespace='default']
   * @param {object} [options]
   * @param {number} [options.defaultTtlMs=604800000] - 7 days
   * @param {number} [options.dimensions=64]
   */
  constructor(client, namespace = "default", options = {}) {
    this.client = client;
    this.namespace = namespace;
    this.col = client.collection(`_flash_agent_memory_${namespace}`);
    this.defaultTtlMs = options.defaultTtlMs ?? 7 * 86400000;
    this.dimensions = options.dimensions ?? 64;
    this.stats = { remembered: 0, recalled: 0, pruned: 0 };
  }

  /**
   * Store a memory with semantic embedding and optional TTL.
   */
  async remember(content, options = {}) {
    await this.col.init();
    const embedding = flashEmbed(content, this.dimensions);
    const now = Date.now();
    const doc = {
      content,
      tags: options.tags || [],
      importance: options.importance ?? 1,
      createdAt: now,
      expiresAt: now + (options.ttlMs ?? this.defaultTtlMs),
      $vector: Array.from(embedding),
    };
    const res = await this.col.insertOne(doc);
    this.stats.remembered++;
    return { memoryId: res.insertedId, expiresAt: doc.expiresAt };
  }

  /**
   * Recall memories by semantic similarity with recency + importance weighting.
   */
  async recall(query, options = {}) {
    await this.col.init();
    this.stats.recalled++;
    const topK = options.topK ?? 5;
    await this.pruneExpired();

    const vec = flashEmbed(query, this.dimensions);
    const hits = await this.col.vectorSearch({
      vector: Array.from(vec),
      topK: topK * 3,
    });

    const now = Date.now();
    const scored = hits
      .filter((h) => !h.expiresAt || h.expiresAt > now)
      .map((h) => {
        const ageHours = (now - (h.createdAt || now)) / 3600000;
        const recency = Math.exp(-ageHours / 168);
        const semantic = h._score ?? 0;
        const importance = h.importance ?? 1;
        return {
          memoryId: h._id,
          content: h.content,
          tags: h.tags || [],
          score: semantic * importance * recency,
          semantic,
          importance,
          recency,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async forget(memoryId) {
    await this.col.init();
    return this.col.deleteOne({ _id: memoryId });
  }

  async pruneExpired() {
    await this.col.init();
    const all = await this.col.find({}).exec();
    const now = Date.now();
    let pruned = 0;
    for (const doc of all) {
      if (doc.expiresAt && doc.expiresAt <= now) {
        await this.col.deleteOne({ _id: doc._id });
        pruned++;
      }
    }
    this.stats.pruned += pruned;
    return pruned;
  }
}
