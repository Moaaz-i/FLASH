/**
 * Multi-agent shared memory — agents read/write encrypted episodic memory.
 */
export class FlashMultiAgentSync {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} [namespace='multi_agent']
   */
  constructor(client, namespace = "multi_agent") {
    this.client = client;
    this.memory = client.agentMemory(namespace);
    /** @type {Set<string>} */
    this.agents = new Set();
  }

  registerAgent(agentId) {
    this.agents.add(agentId);
    return agentId;
  }

  async share(agentId, content, options = {}) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    return this.memory.remember(content, {
      tags: [...(options.tags || []), `agent:${agentId}`],
      importance: options.importance ?? 1,
      ttlMs: options.ttlMs,
    });
  }

  async getSharedContext(query, options = {}) {
    const recalled = await this.memory.recall(query, {
      topK: options.topK ?? 10,
    });
    return {
      agents: [...this.agents],
      memories: recalled,
      context: recalled.map((r) => r.content).join("\n"),
    };
  }
}
