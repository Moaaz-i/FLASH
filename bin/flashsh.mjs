#!/usr/bin/env node
import repl from "node:repl";
import path from "node:path";
import { FlashClient, logger } from "../src/index.mjs";

const args = process.argv.slice(2);
let uri = null;
let storagePath = "./flash_data";
let secretKey = "flash_master_key_default";
let quiet = false;
let command = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--uri" && args[i + 1]) uri = args[++i];
  if (args[i] === "--storage" && args[i + 1]) storagePath = args[++i];
  if (args[i] === "--key" && args[i + 1]) secretKey = args[++i];
  if (args[i] === "--quiet" || args[i] === "-q") quiet = true;
  if (args[i] === "ask" || args[i] === "ingest" || args[i] === "proof") {
    command = args[i];
  }
}

if (command || quiet || process.env.FLASH_LOG_LEVEL === undefined) {
  logger.setLevel(process.env.FLASH_LOG_LEVEL || (command ? "error" : "info"));
}

const client = new FlashClient({ uri, storagePath, secretKey });

async function runCommand() {
  if (command === "ask") {
    const question = args.slice(args.indexOf("ask") + 1).join(" ").trim();
    if (!question) {
      console.error('Usage: flashsh ask "your question"');
      console.error("Tip: ingest documents first → flashsh ingest mydoc.txt");
      process.exit(1);
    }

    const rag = client.privateRAG("cli_knowledge");
    const answer = await rag.ask(question);

    if (!answer.contextPack || answer.sources.length === 0) {
      console.log("(no matching knowledge found)");
      console.log("");
      console.log("The private RAG collection is empty or has no relevant chunks.");
      console.log("Add knowledge first:");
      console.log("  flashsh ingest ./my-notes.txt");
      console.log("  echo 'FLASH is encrypted intelligence storage' | flashsh ingest -");
      console.log("");
      console.log(`Storage: ${storagePath}  |  Collection: cli_knowledge`);
      await client.close();
      process.exit(0);
    }

    console.log(answer.contextPack);
    if (!quiet) {
      console.error("");
      console.error(
        `# ${answer.sources.length} source(s) | ~${answer.tokens.used} tokens | server-blind: yes`,
      );
    }
    await client.close();
    process.exit(0);
  }

  if (command === "proof") {
    const col = args[args.indexOf("proof") + 1] || "default";
    const proof = await client.integrityProof(col);
    console.log(JSON.stringify(proof, null, 2));
    await client.close();
    process.exit(0);
  }

  if (command === "ingest") {
    const file = args[args.indexOf("ingest") + 1];
    if (!file) {
      console.error("Usage: flashsh ingest <file.txt>");
      console.error("       flashsh ingest -   # read from stdin");
      process.exit(1);
    }
    const fs = await import("node:fs/promises");
    let text;
    if (file === "-") {
      text = await new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => {
          data += chunk;
        });
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
      });
    } else {
      text = await fs.readFile(file, "utf-8");
    }
    const rag = client.privateRAG("cli_knowledge");
    const result = await rag.ingest({
      title: file === "-" ? "stdin" : path.basename(file),
      text,
    });
    console.log(
      `Ingested ${result.chunks} chunk(s) into cli_knowledge (parentId: ${result.parentId})`,
    );
    await client.close();
    process.exit(0);
  }

  console.log(`
⚡ FLASH Sovereign Zero-Knowledge Shell (flashsh)
Connected: ${uri ? `Remote (${uri})` : `Embedded (${storagePath})`}

CLI:
  flashsh ingest notes.txt     # add knowledge to private RAG
  flashsh ask "your question"  # semantic search over ingested docs
  flashsh proof collectionName # integrity proof

Options: --storage ./data  --key secret  --quiet
REPL: help() | client.privateRAG() | client.agentMemory()
`);

  const r = repl.start({ prompt: "flashsh> ", useColors: true });
  r.context.client = client;
  r.context.help = () => {
    console.log(`
  await client.privateRAG('kb').ingest({ title: 'doc', text: '...' })
  await client.privateRAG('kb').ask('question')
  client.agentMemory('bot').remember('fact')
  client.sealedVault('secrets').unlock('pass')
  await client.integrityProof('col')
    `);
  };
  r.on("exit", async () => {
    await client.close();
    process.exit(0);
  });
}

runCommand().catch(async (err) => {
  console.error(err.message || err);
  await client.close().catch(() => {});
  process.exit(1);
});
