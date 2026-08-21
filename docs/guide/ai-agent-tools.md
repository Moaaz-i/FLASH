# 🤖 Autonomous AI Agent Tools & Function Calling Registry

FLASH includes a **Standardized Tool & Function Calling Registry** and an **Automated Autonomous Execution Loop**.

This allows LLMs (OpenAI, DeepSeek, Groq, Ollama, Gemini, Claude) to automatically query local FLASH database collections, search vectors, or call external REST APIs.

---

## 🚀 1. Expose Collections as AI Tools (Zero Setup)

You can turn any FLASH collection into a callable AI Tool with a single method call:

```javascript
import { FlashAIDatabase } from '@moaaz-i/flash-db';

const aiDb = new FlashAIDatabase({ name: 'store_ai_vault' });

// 1. Insert data into collections
const products = aiDb.db.collection('products');
await products.insertOne({ name: 'MacBook Pro M3', price: 1999, category: 'laptops' });
await products.insertOne({ name: 'iPad Pro OLED', price: 999, category: 'tablets' });

// 2. Automatically register collection as an AI tool
aiDb.registerCollectionAsTool('products', {
  description: 'Search available tech products by category, price, or name filter.',
});

// Now any LLM can call "query_products" automatically!
```

---

## 🛠️ 2. Register Custom Tools & External APIs

You can register custom async developer functions and external APIs:

```javascript
import { FlashLLMAdapter } from '@moaaz-i/flash-db';

const llm = new FlashLLMAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

// Register external weather API tool
llm.registerTool({
  name: 'get_current_weather',
  description: 'Get real-time weather conditions for a given city.',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name e.g. Riyadh, London' },
    },
    required: ['city'],
  },
  handler: async ({ city }) => {
    const res = await fetch(`https://api.weatherapi.com/v1/current.json?q=${city}`);
    return await res.json();
  },
});
```

---

## ⚡ 3. Autonomous Multi-Turn Execution Loop

`generateWithTools` automatically executes requested tools and feeds the results back to the LLM until the final answer is reached:

```javascript
const response = await llm.generateWithTools('What is the weather in Riyadh and do we have MacBook Pro in stock?');

console.log(response.text);
console.log(`Tools Executed: ${response.toolExecutionCount}`);
console.log('Execution Trace:', response.toolLog);
```
