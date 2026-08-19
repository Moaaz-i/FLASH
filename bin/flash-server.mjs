#!/usr/bin/env node
import { FlashServer } from '../src/index.mjs';

const args = process.argv.slice(2);
let port = 6742;
let host = '0.0.0.0';
let storagePath = './flash_server_data';
let authKey = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  if (args[i] === '--host' && args[i + 1]) host = args[++i];
  if (args[i] === '--storage' && args[i + 1]) storagePath = args[++i];
  if (args[i] === '--authKey' && args[i + 1]) authKey = args[++i];
}

console.log(`⚡ Starting FLASH Standalone Server daemon on ${host}:${port}...`);
FlashServer.start({ port, host, storagePath, authKey });
