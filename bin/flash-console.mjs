#!/usr/bin/env node
import { FlashClient } from "../src/index.mjs";

const args = process.argv.slice(2);
let port = 3456;
let storagePath = "./flash_data";
let secretKey = process.env.FLASH_MASTER_KEY || "flash_console_default_key";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
  if (args[i] === "--storage" && args[i + 1]) storagePath = args[++i];
  if (args[i] === "--key" && args[i + 1]) secretKey = args[++i];
}

const client = new FlashClient({ secretKey, storagePath });

console.log(`
⚡ FLASH Intelligence Console
   Server-blind · Local-first · AI-native
`);

await client.openDashboard({ port, host: "127.0.0.1" });
const url = `http://127.0.0.1:${port}`;
console.log(`→ ${url}`);
console.log(`  Press Ctrl+C to stop\n`);

process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});
