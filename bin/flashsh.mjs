#!/usr/bin/env node
import repl from "node:repl";
import path from "node:path";
import fs from "node:fs";
import {
  FlashClient,
  logger,
  writeWrappedKeyFiles,
  FLASH_WRAP_FILENAME,
  FLASH_TAKE_FILENAME,
} from "../src/index.mjs";

const BANNER = `
\u001b[35m\u001b[1m
  ⚡ FLASH — Zero-Knowledge Encrypted Intelligence Database
\u001b[0m
  \u001b[2mServer-blind · Local-first · AI-native\u001b[0m
  \u001b[2mThe database that powers private AI — encrypted by architecture.\u001b[0m
`;

const args = process.argv.slice(2);
let uri = null;
let storagePath = "./flash_data";
let secretKey = null;
let quiet = false;
let force = false;
let wrapDir = process.cwd();
let command = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--uri" && args[i + 1]) uri = args[++i];
  else if (args[i] === "--storage" && args[i + 1]) storagePath = args[++i];
  else if (args[i] === "--key" && args[i + 1]) secretKey = args[++i];
  else if (args[i] === "--dir" && args[i + 1]) wrapDir = args[++i];
  else if (args[i] === "--quiet" || args[i] === "-q") quiet = true;
  else if (args[i] === "--force" || args[i] === "-f") force = true;
  else if (
    args[i] === "ask" ||
    args[i] === "ingest" ||
    args[i] === "proof" ||
    args[i] === "init" ||
    args[i] === "wrap-key"
  ) {
    command = args[i];
  }
}

if (command || quiet || process.env.FLASH_LOG_LEVEL === undefined) {
  logger.setLevel(process.env.FLASH_LOG_LEVEL || (command ? "error" : "info"));
}

function createClient() {
  const opts = { uri, storagePath, wrapKeyDir: wrapDir };
  if (secretKey) opts.secretKey = secretKey;
  // If no --key, FlashClient resolves .flash-take + .flash-wrap automatically.
  return new FlashClient(opts);
}

async function runWrapKey() {
  const result = writeWrappedKeyFiles({
    dir: wrapDir,
    secretKey: secretKey || undefined,
    force,
  });
  console.log("Done.");
  console.log("");
  console.log("  SECURITY (v1.3.0): You are fully responsible for key storage,");
  console.log("  backups, .gitignore, and CI secrets. FLASH does not audit this flow.");
  console.log("");
  console.log("  KEY FORMAT (this release only):");
  console.log(`    ${FLASH_WRAP_FILENAME}  → one line: flash_wrap_<base64url>`);
  console.log(`    ${FLASH_TAKE_FILENAME}  → line 1: FLASHTAKE1, line 2: sealed blob`);
  console.log("    Other formats are rejected. Docs: /guide/flashsh-cli");
  console.log("");
  console.log("  FILES:");
  console.log(
    `    ${FLASH_WRAP_FILENAME}  → keep private (your .gitignore / FLASH_WRAP_KEY)`,
  );
  console.log(`    ${FLASH_TAKE_FILENAME}  → sealed master (ok to commit without wrap)`);
  console.log(`    ${result.wrapPath}`);
  console.log(`    ${result.takePath}`);
  if (result.generatedSecretKey) {
    console.log("");
    console.log(
      "  Master secret was generated as flash_master_… and sealed (not printed).",
    );
    console.log("  Back up .flash-wrap — lost wrap key = unrecoverable .flash-take.");
  }
  console.log("");
  console.log("  Never print or commit .flash-wrap.");
  process.exit(0);
}

async function runInit(client) {
  const resolved = path.resolve(storagePath);
  fs.mkdirSync(resolved, { recursive: true });

  const samplePath = path.join(resolved, "WELCOME.txt");
  const sampleText = `Welcome to FLASH Intelligence Storage.

FLASH is server-blind: this text is encrypted client-side before it touches disk.
Use 'flashsh ingest ${samplePath}' to add this file to Private RAG.
Then: flashsh ask "what is FLASH?"
`;
  fs.writeFileSync(samplePath, sampleText, "utf-8");

  const rag = client.privateRAG("cli_knowledge");
  const result = await rag.ingest({
    title: "FLASH Welcome",
    text: sampleText,
  });

  console.log(BANNER);
  console.log(`✓ Initialized intelligence workspace`);
  console.log(`  Storage:     ${resolved}`);
  console.log(`  Sample file: ${samplePath}`);
  console.log(`  RAG chunks:  ${result.chunks} ingested into cli_knowledge`);
  console.log(`
Next steps:
  flashsh ask "what is FLASH?"
  flashsh ingest ./your-notes.txt
  flashsh proof cli_knowledge
`);
  await client.close();
  process.exit(0);
}

async function runCommand() {
  if (command === "wrap-key") {
    await runWrapKey();
    return;
  }

  const client = createClient();

  if (command === "init") {
    await runInit(client);
    return;
  }

  if (command === "ask") {
    const question = args
      .slice(args.indexOf("ask") + 1)
      .join(" ")
      .trim();
    if (!question) {
      console.error('Usage: flashsh ask "your question"');
      console.error("Tip: run flashsh init first, or flashsh ingest mydoc.txt");
      process.exit(1);
    }

    const rag = client.privateRAG("cli_knowledge");
    const answer = await rag.ask(question);

    if (!answer.contextPack || answer.sources.length === 0) {
      console.log("(no matching knowledge found)");
      console.log("");
      console.log(
        "The private RAG collection is empty or has no relevant chunks.",
      );
      console.log("Add knowledge first:");
      console.log("  flashsh init");
      console.log("  flashsh ingest ./my-notes.txt");
      console.log(
        "  echo 'FLASH is encrypted intelligence storage' | flashsh ingest -",
      );
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
    const fsPromises = await import("node:fs/promises");
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
      text = await fsPromises.readFile(file, "utf-8");
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

  console.log(BANNER);
  console.log(`Connected: ${uri ? `Remote (${uri})` : `Embedded (${storagePath})`}

CLI:
  flashsh wrap-key               # create .flash-wrap + sealed .flash-take
  flashsh init                   # bootstrap workspace + sample RAG
  flashsh ingest notes.txt       # add knowledge to private RAG
  flashsh ask "your question"    # semantic search over ingested docs
  flashsh proof collectionName   # integrity proof

Options: --storage ./data  --key secret  --dir .  --force  --quiet
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
  process.exit(1);
});
