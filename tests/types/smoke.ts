/**
 * Compile-only smoke test — validates src/index.d.ts against v1.3.2 API surface.
 * Run: npm run typecheck
 */
import {
  FlashClient,
  FlashDatabase,
  FlashRecordCodec,
  FlashStorageCompact,
  MemoryArc,
  resolveEngineOptions,
  TURBO_MEMTABLE_THRESHOLD,
  type EncryptedDocument,
  type FieldPolicyType,
  type FlashEngineOptions,
  type QueryEnvelope,
  type TrapdoorToken,
} from "@moaaz-i/flash-db";

const engineOpts: FlashEngineOptions = resolveEngineOptions({
  performanceProfile: "turbo",
  storageProfile: "compact",
  compressionLevel: 6,
  disableMerkle: true,
});

void TURBO_MEMTABLE_THRESHOLD;

const policy: FieldPolicyType = "encrypted";

const client = new FlashClient({
  secretKey: "typecheck_smoke_key_32_chars!",
  storageProfile: "compact",
  inMemory: true,
  fieldPolicy: { body: policy, email: "exact", tags: "plaintext" },
  engineOptions: engineOpts,
});

void client.storageProfile;

const db = new FlashDatabase("smoke_db", {
  inMemory: true,
  engineOptions: engineOpts,
});

void db.inMemory;

async function exercise(): Promise<void> {
  const col = client.collection<{ name: string; email: string }>("users");
  const buf = client.encryptToBuffer({ name: "Ada", email: "ada@test.com" });
  client.decryptFromBuffer(buf);
  client.decryptFieldsFromBuffer(buf, ["name"]);

  FlashRecordCodec.decryptFields(client, buf, ["name"]);
  FlashRecordCodec.toEncryptedEnvelope(buf, client);

  const enc: EncryptedDocument = client.encryptDocument({
    name: "Test",
    email: "t@test.com",
  });
  const flat = FlashStorageCompact.flattenRecord(enc);
  FlashStorageCompact.expandRecord(flat);

  const trap: TrapdoorToken = "abc123";
  const envelope: QueryEnvelope = {
    $exact: { email: trap },
    $ids: ["id-1"],
  };

  const raw = db.collection("raw");
  void raw.inMemory;
  void raw.disableMerkle;
  void raw.compressionLevel;

  const rows: Buffer[] = await raw.find(envelope);
  const one: Buffer | null = await raw.findOne({ _id: "id-1" });
  void rows;
  void one;

  const arc = new MemoryArc();
  await arc.close();

  await client.close();
  await db.close();
}

void exercise();
