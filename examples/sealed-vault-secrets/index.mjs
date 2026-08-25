#!/usr/bin/env node
/**
 * FLASH Example: Sealed Vault Secrets
 * Passphrase-isolated secret storage with auto-lock semantics.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FlashClient } from "../../src/index.mjs";

const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "flash-vault-ex-"));

// Demo-only inline key. Apps: flashsh wrap-key → new FlashClient({ storagePath })
const client = new FlashClient({
  secretKey: "example_vault_key_32_chars_min!",
  storagePath,
});

try {
  console.log("⚡ FLASH Sealed Vault Example\n");

  const vault = client.sealedVault("app_secrets");
  vault.unlock("my-secure-passphrase");

  await vault.put("openai_api", {
    service: "openai",
    value: "sk-demo-not-real-key",
  });
  await vault.put("db_backup_key", {
    service: "backup",
    value: "aes-256-backup-key-demo",
  });

  console.log("✓ Stored 2 secrets in sealed vault\n");

  const api = await vault.get("openai_api");
  console.log("Retrieved openai_api:");
  console.log(`  service: ${api.service}`);
  console.log(`  value:   ${api.value.slice(0, 8)}... (masked)\n`);

  vault.lock();
  console.log("✓ Vault locked — secrets require passphrase to access again");
} finally {
  await client.close();
  fs.rmSync(storagePath, { recursive: true, force: true });
}
