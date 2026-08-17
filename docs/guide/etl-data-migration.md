# High-Speed ETL & Bulk Data Migration

**FLASH DB** provides `FlashETL` for streaming high-throughput export and import between FLASH collections and standard data science formats (`NDJSON` and `CSV`).

---

## Streaming NDJSON Export & Import

Newline Delimited JSON (NDJSON / JSON Lines) allows streaming millions of documents without buffering the entire dataset in RAM.

### 1. Export Collection to NDJSON

```javascript
import { FlashCollection, FlashETL } from '@moaaz-yahia-zakaria/flash-db';

const col = new FlashCollection('customers', './data');
await col.init();

const report = await FlashETL.exportToNDJSON(col, './backups/customers.ndjson');
console.log(`Exported ${report.exportedCount} records to ${report.filePath}`);
```

### 2. Stream Import from NDJSON in Batches

```javascript
const targetCol = new FlashCollection('customers_staging', './data');
await targetCol.init();

const result = await FlashETL.importFromNDJSON(
  targetCol,
  './backups/customers.ndjson',
  500 // Batch size (500 docs per chunk)
);

console.log(`Imported ${result.importedCount} records successfully!`);
```

---

## CSV Export for BI & Data Science

Export collection data directly into CSV format compatible with Excel, Pandas, and BI dashboards:

```javascript
await FlashETL.exportToCSV(
  col,
  './reports/sales_summary.csv',
  ['_id', 'customerName', 'totalAmount', 'status'] // Optional header field filter
);
```
