# Zero-Knowledge SQL Query Engine

**FLASH DB** provides `FlashSQL`, allowing developers and analytics tools to execute standard SQL queries directly over document collections.

---

## Supported SQL Capabilities

* `SELECT` with field projections (`SELECT name, email, balance FROM ...`)
* `WHERE` clauses with `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE %...%` and `AND` logic
* `ORDER BY <field> ASC | DESC`
* `LIMIT` and `OFFSET` pagination

---

## Example Usage

```javascript
import { FlashDatabase, FlashSQL } from '@moaaz-yahia-zakaria/flash-db';

const db = new FlashDatabase('ecommerce', { storagePath: './data' });
const customers = db.collection('customers');
await customers.init();

await customers.insertMany([
  { name: 'Ada Lovelace', age: 32, score: 98, role: 'VIP' },
  { name: 'Charles Babbage', age: 40, score: 85, role: 'User' },
  { name: 'Alan Turing', age: 28, score: 95, role: 'VIP' }
]);

// Execute SQL Query directly
const results = await FlashSQL.execute(
  db,
  "SELECT name, score FROM customers WHERE age >= 30 AND score > 90 ORDER BY score DESC LIMIT 10"
);

console.log(results);
// [ { name: 'Ada Lovelace', score: 98 } ]
```
