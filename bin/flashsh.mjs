#!/usr/bin/env node
import repl from 'node:repl';
import { FlashClient } from '../src/index.mjs';

const args = process.argv.slice(2);
let uri = null;
let storagePath = './flash_data';
let secretKey = 'flash_master_key_default';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--uri' && args[i + 1]) uri = args[++i];
  if (args[i] === '--storage' && args[i + 1]) storagePath = args[++i];
  if (args[i] === '--key' && args[i + 1]) secretKey = args[++i];
}

console.log(`
⚡ FLASH Sovereign Zero-Knowledge Interactive Shell (flashsh v1.0.0)
Type "help()" or "show collections" to explore.
Connected mode: ${uri ? `Remote (${uri})` : `Embedded (${storagePath})`}
`);

const client = new FlashClient({
  uri,
  storagePath,
  secretKey
});

const r = repl.start({
  prompt: 'flashsh> ',
  useColors: true
});

r.context.client = client;
r.context.db = client.db;
r.context.help = () => {
  console.log(`
Commands & Methods:
  - db.collection(name)            : Access a collection
  - await db.users.find()          : Query all documents
  - await db.users.insertOne(doc)  : Insert a document
  - await db.users.updateOne(...)  : Update a document
  - await db.users.deleteOne(...)  : Delete a document
  - showCollections()              : List collections
  `);
};
r.context.showCollections = () => {
  console.log(client.db.listCollections());
};

r.on('exit', () => {
  console.log('\nGoodbye from FLASH DB! ⚡');
  process.exit(0);
});
