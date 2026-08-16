import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  FlashQuantizer,
  FlashContextOptimizer,
  FlashSemanticCache,
  FlashLLMAdapter,
  FlashAIDatabase,
  FlashVectorIndex,
} from '../src/index.mjs';

test('Superpowers - Vector Quantization SQ8 & 1-Bit Binary (32x RAM Savings)', () => {
  const originalVec = new Float32Array([0.85, -0.42, 0.91, -0.15, 0.05, 0.77, -0.88, 0.33]);

  // 1. SQ8 Quantization
  const sq8 = FlashQuantizer.quantizeSQ8(originalVec);
  assert.strictEqual(sq8.data.length, originalVec.length);
  assert.strictEqual(sq8.format, 'sq8');

  // Dequantize and check accuracy
  const dequant = FlashQuantizer.dequantizeSQ8(sq8.data, sq8.min, sq8.scale);
  let maxDiff = 0;
  for (let i = 0; i < originalVec.length; i++) {
    const diff = Math.abs(originalVec[i] - dequant[i]);
    if (diff > maxDiff) maxDiff = diff;
  }
  assert.ok(maxDiff < 0.02, `SQ8 reconstruction error should be tiny (< 0.02), got ${maxDiff}`);

  // Asymmetric Cosine Similarity directly on SQ8
  const queryVec = new Float32Array([0.80, -0.40, 0.88, -0.10, 0.00, 0.70, -0.85, 0.30]);
  const asymScore = FlashQuantizer.asymmetricCosineSQ8(queryVec, sq8.data, sq8.min, sq8.scale);
  const rawScore = FlashVectorIndex.cosineSimilarity(queryVec, originalVec);
  assert.ok(Math.abs(asymScore - rawScore) < 0.015, 'Asymmetric cosine should closely match raw float32 score');

  // 2. 1-Bit Binary Quantization
  const bin = FlashQuantizer.quantizeBinary(originalVec);
  assert.strictEqual(bin.data.length, 1); // 8 dimensions packed into single 32-bit word
  assert.strictEqual(bin.format, 'binary1bit');

  const queryBin = FlashQuantizer.quantizeBinary(queryVec);
  const hammingSim = FlashQuantizer.hammingSimilarity(bin.data, queryBin.data, 8);
  assert.ok(hammingSim >= 0.85, 'Hamming similarity between near vectors should be very high');

  // Memory savings calculation
  const savings = FlashQuantizer.estimateMemorySavings(1000000, 1536);
  assert.ok(savings.sq8Savings.includes('74') || savings.sq8Savings.includes('75'), 'SQ8 should save ~75% RAM');
  assert.ok(savings.binary1BitSavings.includes('32x') || savings.binary1BitSavings.includes('96'), 'Binary should achieve up to 32x savings');
});

test('Superpowers - Reciprocal Rank Fusion & Token Budget Optimizer (RAG Pruner)', () => {
  // 1. Token Estimation (Arabic & English)
  const enText = 'Deep learning embeddings for large language models';
  const arText = 'محرك استرجاع البيانات والذكاء الاصطناعي فائق السرعة';
  const enTokens = FlashContextOptimizer.estimateTokens(enText);
  const arTokens = FlashContextOptimizer.estimateTokens(arText);
  assert.ok(enTokens > 5 && enTokens < 20);
  assert.ok(arTokens > 5 && arTokens < 35);

  // 2. Reciprocal Rank Fusion (RRF)
  const vectorList = [
    { id: 'doc_A', text: 'Quantum Cryptography', score: 0.98 },
    { id: 'doc_B', text: 'Zero Knowledge Proofs', score: 0.85 },
  ];
  const bm25List = [
    { id: 'doc_B', text: 'Zero Knowledge Proofs', score: 12.4 },
    { id: 'doc_C', text: 'Homomorphic Encryption', score: 9.1 },
  ];

  const fused = FlashContextOptimizer.reciprocalRankFusion([vectorList, bm25List], { k: 60 });
  assert.strictEqual(fused.length, 3);
  // doc_B appeared in both lists, so it should rank #1 with highest RRF score
  assert.strictEqual(fused[0].id, 'doc_B');
  assert.ok(fused[0].rrfScore > fused[1].rrfScore);

  // 3. Token Budget Optimization
  const longDocs = [
    { id: '1', text: 'A '.repeat(200) },
    { id: '2', text: 'B '.repeat(200) },
    { id: '3', text: 'C '.repeat(200) },
  ];

  const optimized = FlashContextOptimizer.optimizeTokenBudget(longDocs, { maxTokens: 120 });
  assert.ok(optimized.totalTokens <= 130, `Tokens (${optimized.totalTokens}) should respect the ceiling`);
  assert.ok(optimized.savedTokensEstimate > 0, 'Should register saved tokens');
});

test('Superpowers - Multi-Tier Semantic Cache (L1 RAM + L2 Persistent Disk)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cache-tier-'));

  try {
    const db = new FlashAIDatabase({
      name: 'test_cache_db',
      storagePath: tmpDir,
      dimensions: 32,
      similarityThreshold: 0.85,
    });

    const prompt1 = 'What is zero knowledge cryptography?';
    const vec1 = db.embed(prompt1);
    const mockAnswer = 'Zero knowledge cryptography allows proving truth without revealing data.';

    // Store in cache (promotes to L1 and saves to L2 disk collection)
    await db.semanticCache.set(prompt1, vec1, mockAnswer);

    // L1 Hot Hit
    const hitL1 = await db.semanticCache.get(vec1, prompt1);
    assert.ok(hitL1 && hitL1.hit);
    assert.strictEqual(hitL1.tier, 'L1');
    assert.strictEqual(hitL1.response, mockAnswer);

    // Clear L1 memory to simulate RAM restart
    db.semanticCache.clear();

    // L2 Disk Hit & Promotion
    const hitL2 = await db.semanticCache.getAsync(vec1, prompt1);
    assert.ok(hitL2 && hitL2.hit);
    assert.strictEqual(hitL2.tier, 'L2');
    assert.strictEqual(hitL2.response, mockAnswer);

    // Should now be promoted back to L1
    assert.strictEqual(db.semanticCache.l1Cache.size, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Superpowers - Autonomous Tool Calling & Collection-to-Tool Registry', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-tools-test-'));

  try {
    const aiDb = new FlashAIDatabase({
      name: 'agent_db',
      storagePath: tmpDir,
      dimensions: 16,
    });

    // Populate a collection
    const products = aiDb.db.collection('products');
    await products.insertOne({ name: 'MacBook Pro M3', price: 1999, category: 'laptops' });
    await products.insertOne({ name: 'iPad Pro OLED', price: 999, category: 'tablets' });

    // Expose products collection as an AI tool automatically
    aiDb.registerCollectionAsTool('products');

    assert.ok(aiDb.llm.tools.has('query_products'));
    const tools = aiDb.llm.listTools();
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].function.name, 'query_products');

    // Test tool execution directly
    const tool = aiDb.llm.tools.get('query_products');
    const result = await tool.handler({ filter: { category: 'laptops' } });
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.results[0].name, 'MacBook Pro M3');

    // Test Autonomous Agent execution loop with Custom Handler
    aiDb.llm.setHandler(async (messages) => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'tool') {
        const parsed = JSON.parse(lastMsg.content);
        return `Found ${parsed.count} laptop: ${parsed.results[0].name} at $${parsed.results[0].price}`;
      }
      // Simulate LLM deciding to call the tool
      return {
        text: 'Let me search the products database...',
        toolCalls: [
          {
            id: 'call_123',
            function: {
              name: 'query_products',
              arguments: JSON.stringify({ filter: { category: 'laptops' } }),
            },
          },
        ],
      };
    });

    const agentRun = await aiDb.askAgentWithTools('Show me available laptops');
    assert.ok(agentRun.toolExecutionCount >= 1);
    assert.ok(agentRun.text.includes('MacBook Pro M3'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Superpowers - End-to-End FlashAIDatabase RAG with Vector Quantization & Zero-Knowledge Vault', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-ai-e2e-'));

  try {
    const aiDb = new FlashAIDatabase({
      name: 'sovereign_ai_e2e',
      storagePath: tmpDir,
      dimensions: 32,
      quantization: 'sq8',
    });

    // Store knowledge
    await aiDb.remember('FLASH uses LSM-Trees and Zero-Knowledge blind indexing for ultra-fast encrypted search.');
    await aiDb.remember('FLASH vector quantization compresses high-dimensional vectors up to 32x with SQ8 and Binary.');

    assert.strictEqual(aiDb.stats.memoriesStored, 2);
    assert.strictEqual(aiDb.quantizedVectors.size, 2);

    // Hybrid Search RAG
    const ragResult = await aiDb.searchRAG('Tell me about FLASH vector quantization compression', { limit: 2 });
    assert.ok(ragResult.documents.length >= 1);
    assert.ok(ragResult.packedContext.includes('32x'));
    assert.ok(ragResult.totalTokens > 0);

    // Zero-Knowledge Encrypted Session
    const sessionRes = await aiDb.saveChatSession('session_007', [
      { role: 'user', content: 'Is my data encrypted?' },
      { role: 'assistant', content: 'Yes, 100% Zero-Knowledge AES-256-GCM encrypted.' },
    ]);
    assert.strictEqual(sessionRes.saved, true);

    const history = await aiDb.getChatHistory('session_007');
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].content, 'Is my data encrypted?');

    // Verify raw database record is ciphertext, not plaintext
    const rawDoc = await aiDb.sessionCollection.findOne({ _id: 'session_007' });
    assert.ok(rawDoc.encryptedPayload && !rawDoc.encryptedPayload.includes('Zero-Knowledge'));

    // Verify memory statistics
    const stats = aiDb.getMetrics();
    assert.strictEqual(stats.quantization, 'sq8');
    assert.ok(stats.memorySavings.sq8Savings.includes('%'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
