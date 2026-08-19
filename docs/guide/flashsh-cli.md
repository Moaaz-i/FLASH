# flashsh CLI

The `flashsh` command provides a sovereign zero-knowledge shell for FLASH DB.

---

## Installation

```bash
npm install -g @moaaz-yahia-zakaria/flash-db
```

Or via npx:

```bash
npx @moaaz-yahia-zakaria/flash-db flashsh ask "question"
```

---

## Commands

### Interactive REPL

```bash
flashsh
# flashsh> client.privateRAG('kb').ask('question')
```

### Ingest knowledge (Private RAG)

```bash
flashsh ingest ./notes.txt
echo "FLASH encrypts client-side" | flashsh ingest -
```

### Semantic search (not a chatbot)

```bash
flashsh ask "does the server see plaintext?"
```

`ask` searches **ingested documents** via semantic similarity. It returns the closest matching chunks — not a conversational LLM reply.

### Integrity proof

```bash
flashsh proof users
```

---

## Options

| Flag | Description |
|------|-------------|
| `--storage ./data` | Storage directory (default: `./flash_data`) |
| `--key secret` | Master secret key |
| `--uri flash://host:6742` | Remote FLASH server |
| `--quiet` / `-q` | Suppress metadata output |

---

## Workflow

```bash
# 1. Add documents
flashsh ingest medical-notes.txt
flashsh ingest legal-contract.pdf.txt

# 2. Search
flashsh ask "side effects"
flashsh ask "termination clause"
```

Collection used: `cli_knowledge` under `{storagePath}/flash_db/`.
