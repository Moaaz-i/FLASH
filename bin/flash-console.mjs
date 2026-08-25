#!/usr/bin/env node
import crypto from "node:crypto";
import { FlashClient } from "../src/index.mjs";

const args = process.argv.slice(2);
let port = 3456;
let storagePath = "./flash_data";
let secretKey = process.env.FLASH_MASTER_KEY || null;
let wrapKeyDir = process.cwd();
let token = process.env.FLASH_CONSOLE_TOKEN || null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === "--storage" && args[i + 1]) storagePath = args[++i];
  else if (args[i] === "--key" && args[i + 1]) secretKey = args[++i];
  else if (args[i] === "--dir" && args[i + 1]) wrapKeyDir = args[++i];
  else if (args[i] === "--token" && args[i + 1]) token = args[++i];
}

const clientOpts = { storagePath, wrapKeyDir };
if (secretKey) clientOpts.secretKey = secretKey;

let client;
try {
  client = new FlashClient(clientOpts);
} catch (err) {
  console.error(
    err.message ||
      "Could not open FlashClient. Run flashsh wrap-key, or set FLASH_MASTER_KEY / --key.",
  );
  process.exit(1);
}

if (!token) {
  token = crypto.randomBytes(24).toString("hex");
}

console.log(`
⚡ FLASH Intelligence Console
   Server-blind · Local-first · Bind 127.0.0.1
`);

await client.openDashboard({ port, host: "127.0.0.1", token });
const url = `http://127.0.0.1:${port}`;
console.log(`→ ${url}`);
console.log(`  Dashboard token (x-flash-token): ${token}`);
console.log(`  Press Ctrl+C to stop\n`);

process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});
