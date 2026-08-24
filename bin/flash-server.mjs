#!/usr/bin/env node
import { FlashServer } from "../src/index.mjs";

const args = process.argv.slice(2);
let port = 6742;
let host = "127.0.0.1";
let storagePath = "./flash_server_data";
let authKey = process.env.FLASH_AUTH_KEY || null;
let allowPublicBind = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
  if (args[i] === "--host" && args[i + 1]) host = args[++i];
  if (args[i] === "--storage" && args[i + 1]) storagePath = args[++i];
  if (args[i] === "--authKey" && args[i + 1]) authKey = args[++i];
  if (args[i] === "--allow-public") allowPublicBind = true;
}

if (!authKey) {
  console.error(
    "FLASH server refuses to start without FLASH_AUTH_KEY or --authKey (16+ byte secret).",
  );
  process.exit(1);
}

console.log(`⚡ Starting FLASH Zero-Knowledge Server on ${host}:${port}...`);
FlashServer.start({
  port,
  host,
  storagePath,
  authKey,
  allowPublicBind,
});
