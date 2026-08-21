# 🌐 Universal Polyglot Query Engine: Any Language & Script

**`FlashNLQueryEngine`** is a **Universal, Script-Agnostic Natural Language Query Compiler**.

It enables users and AI agents to search and filter database collections using **ANY natural language, dialect, or custom pseudocode** on Earth — including newly invented languages.

---

## 🌟 Supported Languages & Scripts

`FlashNLQueryEngine` requires **zero language-specific hardcoding**. It seamlessly processes:

- **Arabic & Eastern Arabic-Indic Digits** (`٠-٩`, `المستخدمين الذين عمرهم > ٢٥`)
- **English** (`Users with age > 25 and active status`)
- **Chinese & Japanese (Continuous Space-less Scripts)** (`查找 age > 20 的活跃用户`)
- **French** (`Utilisateurs avec age > 30 et statut actif`)
- **Spanish** (`Usuarios con edad entre 18 y 65`)
- **Russian & Cyrillic** (`Пользователи с балансом больше 500`)
- **German** (`Top 10 Benutzer mit Gehalt > 5000`)
- **Hindi & Devanagari** (`उपयोगकर्ता जिनकी आयु > 25 है`)
- **Emojis & Mathematical Symbols** (`⭐ rating >= 4.5 and 💰 price < 100`)

---

## 🚀 1. Offline Fast Polyglot Parsing

Translates queries in `< 0.05ms` offline:

```javascript
import { FlashNLQueryEngine } from 'flash-zk';

const schema = ['age', 'salary', 'status', 'city', 'rating'];

// Arabic query with Eastern numerals
const qAr = FlashNLQueryEngine.parse('العملاء الذين عمرهم بين ٢٠ و ٤٠ وحالتهم نشط', schema);
console.log(qAr.filter);
// { age: { $gte: 20, $lte: 40 }, status: 'active' }

// Spanish query with range
const qEs = FlashNLQueryEngine.parse('Usuarios con edad entre 18 y 65', ['edad']);
console.log(qEs.filter);
// { edad: { $gte: 18, $lte: 65 } }

// Chinese query
const qZh = FlashNLQueryEngine.parse('查找 rating > 4.5 的活跃用户', ['rating', 'status']);
console.log(qZh.filter);
// { rating: { $gt: 4.5 }, status: 'active' }
```

---

## 🧠 2. Zero-Shot Polyglot LLM Translation

For highly complex, multi-clause, or conversational sentences in any arbitrary language, `parseWithLLM` leverages external or local LLMs:

```javascript
import { FlashNLQueryEngine, FlashLLMAdapter } from 'flash-zk';

const llm = new FlashLLMAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

const result = await FlashNLQueryEngine.parseWithLLM(
  'Zeige mir alle Kunden aus Berlin mit mehr als 3 Bestellungen und Premium-Status',
  {
    llmAdapter: llm,
    knownFields: ['city', 'ordersCount', 'isVIP', 'status'],
  }
);

console.log(result.filter);
// { city: 'Berlin', ordersCount: { $gt: 3 }, isVIP: true }
```
