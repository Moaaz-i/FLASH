# Zero-Knowledge SQL Query Engine

**FLASH DB** provides `FlashSQL` on **FlashClient**. SQL is parsed locally, predicates become blind-index queries, and plaintext exists only after the client decrypts.

The storage engine never evaluates SQL over plaintext.

---

## Supported SQL Capabilities

- `SELECT` with field projections (`SELECT name, email, balance FROM ...`)
- `WHERE` clauses with `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE %...%` and `AND` logic
- `ORDER BY <field> ASC | DESC`
- `LIMIT` and `OFFSET` pagination

---

## Example Usage

```javascript
import { FlashClient, FlashSQL } from "flash-zk";

const client = new FlashClient({
  storagePath: "./data",
});

const customers = client.collection("customers");
await customers.insertMany([
  { name: "Ada Lovelace", age: 32, score: 98, role: "VIP" },
  { name: "Charles Babbage", age: 40, score: 85, role: "User" },
  { name: "Alan Turing", age: 28, score: 95, role: "VIP" },
]);

const results = await FlashSQL.execute(
  client,
  "SELECT name, score FROM customers WHERE age >= 30 AND score > 90 ORDER BY score DESC LIMIT 10",
);

console.log(results);
// [ { name: 'Ada Lovelace', score: 98 } ]
```
