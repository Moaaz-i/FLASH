import test from 'node:test';
import assert from 'node:assert';
import {
  FlashNLQueryEngine,
  FlashContextOptimizer,
  FlashAIDatabase,
  FlashLLMAdapter,
} from '../src/index.mjs';

test('Universal Polyglot - Script & Language Agnostic Query Engine (Any Language)', async () => {
  // 1. English
  const qEn = FlashNLQueryEngine.parse('Users with age > 25 and active status', ['age', 'status']);
  assert.deepStrictEqual(qEn.filter.age, { $gt: 25 });
  assert.strictEqual(qEn.filter.status, 'active');

  // 2. Arabic with Arabic-Indic digits (٢٥)
  const qAr = FlashNLQueryEngine.parse('المستخدمين الذين عمرهم أكبر من ٢٥ وحالتهم نشط', ['age', 'status']);
  assert.deepStrictEqual(qAr.filter.age, { $gt: 25 });
  assert.strictEqual(qAr.filter.status, 'active');

  // 3. French
  const qFr = FlashNLQueryEngine.parse('Utilisateurs avec age > 30 et statut actif', ['age', 'status']);
  assert.deepStrictEqual(qFr.filter.age, { $gt: 30 });
  assert.strictEqual(qFr.filter.status, 'active');

  // 4. Spanish with range
  const qEs = FlashNLQueryEngine.parse('Usuarios con edad entre 18 y 65', ['edad']);
  assert.deepStrictEqual(qEs.filter.edad, { $gte: 18, $lte: 65 });

  // 5. Chinese (Continuous Script without spaces)
  const qZh = FlashNLQueryEngine.parse('查找 age > 20 的活跃用户', ['age', 'status']);
  assert.deepStrictEqual(qZh.filter.age, { $gt: 20 });
  assert.strictEqual(qZh.filter.status, 'active');

  // 6. Russian
  const qRu = FlashNLQueryEngine.parse('Пользователи с балансом больше 500 и статус активный', ['balance', 'status']);
  assert.deepStrictEqual(qRu.filter.balance, { $gt: 500 });
  assert.strictEqual(qRu.filter.status, 'active');

  // 7. German with limit
  const qDe = FlashNLQueryEngine.parse('Top 10 Benutzer mit Gehalt > 5000', ['salary']);
  assert.deepStrictEqual(qDe.filter.salary, { $gt: 5000 });
  assert.strictEqual(qDe.limit, 10);
});

test('Universal Polyglot - Script-Agnostic Token Budgeting & Dense Vector Embeddings', () => {
  const aiDb = new FlashAIDatabase({ dimensions: 32 });

  // Space-less CJK Language (Chinese / Japanese)
  const zhText1 = '机器学习与人工智能向量数据库';
  const zhText2 = '深度学习与人工智能向量数据库';
  const vecZh1 = aiDb.embed(zhText1);
  const vecZh2 = aiDb.embed(zhText2);
  let dotZh = 0;
  for (let i = 0; i < 32; i++) dotZh += vecZh1[i] * vecZh2[i];
  assert.ok(dotZh >= 0.50, `Chinese semantic embeddings should correlate strongly (>=0.50), got ${dotZh}`);

  // Arabic & Devanagari Token Estimation
  const arTokens = FlashContextOptimizer.estimateTokens('تشفير البيانات فائق السرعة والموثوقية العالية');
  const hiTokens = FlashContextOptimizer.estimateTokens('कृत्रिम बुद्धिमत्ता और उच्च गति डेटाबेस');
  const enTokens = FlashContextOptimizer.estimateTokens('Artificial intelligence high speed database');
  const emojiTokens = FlashContextOptimizer.estimateTokens('🚀 🔒 ⚡ 🧠 💡');

  assert.ok(arTokens > 0);
  assert.ok(hiTokens > 0);
  assert.ok(enTokens > 0);
  assert.ok(emojiTokens > 0);
});

test('Universal Polyglot - Zero-Shot LLM Query Compilation for Any Arbitrary Language', async () => {
  const adapter = new FlashLLMAdapter({
    handler: async (messages) => {
      // Mock LLM compiler returning structured query
      return JSON.stringify({
        filter: { custom_level: { $gte: 90 }, team: 'alpha' },
        sort: { score: -1 },
        limit: 5,
        explanation: 'custom_level >= 90 AND team = "alpha"',
      });
    },
  });

  const parsed = await FlashNLQueryEngine.parseWithLLM(
    'Klaatu barada nikto 90 alpha prime',
    { llmAdapter: adapter, knownFields: ['custom_level', 'team'] }
  );

  assert.strictEqual(parsed.filter.custom_level.$gte, 90);
  assert.strictEqual(parsed.filter.team, 'alpha');
  assert.strictEqual(parsed.limit, 5);
});
