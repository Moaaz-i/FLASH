# FLASH Examples

Runnable demos use **inline demo keys** so you can copy-paste without setup.

**In your app (1.3.0+):** do not hardcode secrets — use:

```bash
flashsh wrap-key
```

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({ storagePath: "./flash_data" });
```

See [flashsh CLI](https://moaaz-i.github.io/FLASH/guide/flashsh-cli) and [Trust Model](https://moaaz-i.github.io/FLASH/guide/trust-model).

| Example                                         | Run                                            |
| ----------------------------------------------- | ---------------------------------------------- |
| [private-rag-cli](./private-rag-cli/)           | `node examples/private-rag-cli/index.mjs`      |
| [agent-memory-bot](./agent-memory-bot/)         | `node examples/agent-memory-bot/index.mjs`     |
| [sealed-vault-secrets](./sealed-vault-secrets/) | `node examples/sealed-vault-secrets/index.mjs` |
| [standalone-vault](./standalone-vault/)         | `node examples/standalone-vault/index.mjs`     |
