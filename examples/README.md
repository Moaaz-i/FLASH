# FLASH Examples

FLASH is a **standalone** zero-knowledge encrypted intelligence database. These examples use only FLASH — no other database product.

| Example                                         | What it demonstrates                          |
| ----------------------------------------------- | --------------------------------------------- |
| [standalone-vault](./standalone-vault/)         | Local sealed vault; engine never sees secrets |
| [private-rag-cli](./private-rag-cli/)           | Ingest text → semantic ask (server-blind RAG) |
| [agent-memory-bot](./agent-memory-bot/)         | Encrypted episodic agent memory               |
| [sealed-vault-secrets](./sealed-vault-secrets/) | Passphrase-sealed secret vault                |

## Run from repo root

```bash
node examples/standalone-vault/index.mjs
node examples/private-rag-cli/index.mjs
node examples/agent-memory-bot/index.mjs
node examples/sealed-vault-secrets/index.mjs
```

Each example uses a temp directory and cleans up on exit.
