# FLASH Intelligence Console

The **Intelligence Console** is a local web UI focused on FLASH-exclusive capabilities — not a generic database admin panel.

---

## Launch

```bash
npx flash-console
# → http://127.0.0.1:3456
```

Or programmatically:

```javascript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({
  secretKey: "master-key",
  storagePath: "./flash_data",
});

client.openDashboard({ port: 3456, token: "optional-secret" });
// → http://localhost:3456
```

---

## Panels

| Panel              | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| **Private RAG**    | Ingest knowledge, semantic ask, view source chunks   |
| **Agent Memory**   | Remember facts, recall by meaning, forget            |
| **Sealed Vault**   | Unlock with passphrase, store credentials, auto-lock |
| **Trust & Safety** | Integrity proofs, prompt firewall PII scan           |
| **Data Explorer**  | Minimal collection/document inspection               |

---

## API Routes

Intelligence endpoints (all under `/api/intelligence/`):

- `POST /rag/ingest` — `{ collection, title, text }`
- `POST /rag/ask` — `{ collection, question }`
- `POST /memory/remember` — `{ namespace, content, importance }`
- `POST /memory/recall` — `{ namespace, query }`
- `DELETE /memory/:namespace/:id`
- `POST /vault/unlock` — `{ vaultName, passphrase }`
- `POST /vault/lock` — `{ vaultName }`
- `GET /vault/list?vaultName=`
- `POST /vault/put` — `{ vaultName, recordId, payload }`
- `POST /proof` — `{ collection, actor }`
- `POST /firewall/scan` — `{ text }`

See also: [Web GUI Dashboard](/guide/gui-dashboard), [Private RAG](/guide/private-rag).
