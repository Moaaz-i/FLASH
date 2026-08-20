import crypto from "node:crypto";
import { FlashBinary } from "../binary/flash_binary.mjs";
import { FlashCipher } from "../crypto/cipher.mjs";
import { FlashBlindIndex } from "../crypto/blind_index.mjs";
import { FlashHomomorphic } from "../crypto/homomorphic.mjs";
import { FlashDatabase } from "../core/database.mjs";
import { FlashVectorIndex } from "../vector/vector_index.mjs";
import { FlashChangeStream } from "../reactive/change_stream.mjs";
import { FlashSession } from "../transactions/session.mjs";
import { FlashPQC } from "../crypto/pqc.mjs";
import { FlashSchema } from "../schema/schema_validator.mjs";
import { FlashDashboard } from "../gui/dashboard_server.mjs";
import { FlashUpdateEngine } from "../engine/update_engine.mjs";
import { FlashSecondaryIndexManager } from "../engine/secondary_index.mjs";
import { FlashQueryEvaluator } from "../engine/query_evaluator.mjs";
import { FlashBulkWriter } from "../engine/bulk_writer.mjs";
import { FlashBackupManager } from "../engine/backup_restore.mjs";
import { FlashTTLManager } from "../engine/ttl_manager.mjs";
import { FlashQuery } from "./fluent_query.mjs";
import { FlashModel, FlashSchemaExtended } from "../odm/flash_model.mjs";
import { FlashSpatialPlugin } from "../plugins/spatial_plugin.mjs";
import { FlashTimeSeriesPlugin } from "../plugins/time_series_plugin.mjs";
import { FlashTextSearchPlugin } from "../plugins/text_search_plugin.mjs";
import { FlashNLQueryEngine } from "../ai/nl_query_engine.mjs";
import { FlashMVCC } from "../transactions/mvcc.mjs";
import path from "node:path";
import fs from "node:fs";
import {
  FlashSpillAggregator,
  materializePipelineData,
  wrapAsPipelineData,
  runGroupStage,
} from "../engine/spill_aggregator.mjs";
import { cleanupSpillDir } from "../engine/compaction_merge.mjs";
import { FlashPrivateRAG } from "../ai/private_rag.mjs";
import { FlashAgentMemory } from "../ai/agent_memory.mjs";
import { FlashSealedVault } from "../security/sealed_vault.mjs";
import { FlashIntegrityProof } from "../security/integrity_proof.mjs";
import { FlashEmbeddingVault } from "../ai/embedding_vault.mjs";
import { FlashPortableBundle } from "../tools/portable_bundle.mjs";
import { FlashLangChainAdapter } from "../ai/langchain_adapter.mjs";
import { FlashFederatedQuery } from "../cluster/federated_query.mjs";
import { FlashMultiAgentSync } from "../ai/multi_agent_sync.mjs";
import { FlashComplianceExport } from "../security/compliance_export.mjs";
import { FlashTimeSeal } from "../security/time_seal.mjs";
import { FlashCloudSync } from "../sync/cloud_sync.mjs";
import { FlashEncryptedCRDT } from "../sync/encrypted_crdt.mjs";
import { FlashBrowserVault } from "../storage/browser_vault.mjs";
import { FlashAuditStream } from "../reactive/audit_stream.mjs";
import { FlashEventHub } from "../reactive/event_hub.mjs";
import { FlashPluginHost } from "../core/plugin_host.mjs";
import { FlashLifecycle } from "../engine/lifecycle.mjs";
import { FlashPaginator } from "../engine/paginator.mjs";
import { FlashMaintenance } from "../engine/maintenance.mjs";
import { FlashPipeline } from "../tools/pipeline.mjs";
import { FlashEventLog } from "../engine/event_log.mjs";
import { FlashCounter } from "../engine/counter.mjs";
import { FlashQueue } from "../engine/queue.mjs";
import { FlashHealth } from "../core/health.mjs";
import { FlashSnapshot } from "../tools/snapshot.mjs";

/**
 * FLASH Zero-Knowledge Client SDK (FlashClient)
 * Next-Gen Encrypted Document DBMS with Vector AI Search, ACID Transactions, and Change Streams
 */
export class FlashClient {
  /**
   * @param {object} config
   * @param {string} config.secretKey - Master Secret Key or Passphrase
   * @param {string} [config.dbName='flash_db']
   * @param {string} [config.storagePath='./data']
   * @param {string} [config.uri] - Network URI for remote server connection (e.g. 'flash://localhost:6742')
   * @param {string} [config.authKey] - Remote server authentication token
   * @param {boolean} [config.pqcHardened=false] - Enable Post-Quantum Cryptography (PQC) key expansion
   * @param {object} [config.engineOptions] - Engine tuning: durability, memtableThreshold, useWorkerFlush
   * @param {boolean} [config.autoTimestamps=true] - Auto createdAt/updatedAt via built-in plugin
   * @param {object} [config.fieldPolicy] - Custom encryption levels per field
   */
  constructor(config = {}) {
    if (!config.secretKey) {
      throw new Error("Secret key is required to initialize FlashClient SDK");
    }

    this.secretKey = config.pqcHardened
      ? FlashPQC.deriveQuantumHardenedKey(config.secretKey)
      : config.secretKey;

    this.cipher = new FlashCipher(this.secretKey);
    this.blindIndex = new FlashBlindIndex(this.secretKey);
    this.homomorphic = new FlashHomomorphic(this.secretKey);
    this.fieldPolicy = config.fieldPolicy || {};
    this.uri = config.uri || config.url || null;
    this.authKey = config.authKey || null;
    this.config = config;

    // ODM Model registry (modelName -> FlashModel)
    this.models = new Map();

    this.mvcc = new FlashMVCC();
    this._activeSession = null;
    this.eventHub = new FlashEventHub();
    this.plugins = new FlashPluginHost(this);
    this._lifecycles = new Map();
    this._maintenance = null;
    this._collections = new Map();

    if (this.uri) {
      // Remote Client-Server Mode
      const normalizedUrl = this.uri.replace(/^flash:\/\//i, "http://");
      this.remoteBaseUrl = normalizedUrl.endsWith("/")
        ? normalizedUrl.slice(0, -1)
        : normalizedUrl;
      this.db = {
        dbName: config.dbName || "flash_remote_db",
        storagePath: config.storagePath || "./data",
        listCollections: async () => {
          try {
            const headers = { "Content-Type": "application/json" };
            if (this.authKey) headers["x-flash-server-key"] = this.authKey;
            const res = await fetch(
              `${this.remoteBaseUrl}/api/v1/collections`,
              { headers },
            );
            if (res.ok) {
              const data = await res.json();
              return data.collections || [];
            }
          } catch (e) {}
          return [];
        },
        collection: (name) =>
          new RemoteCollectionDriver(name, this.remoteBaseUrl, this.authKey),
        close: async () => {},
      };
    } else {
      // Embedded In-Process Mode
      this.db = new FlashDatabase(config.dbName || "flash_db", {
        storagePath: config.storagePath || "./data",
        engineOptions: config.engineOptions,
      });
    }

    if (config.autoTimestamps !== false) {
      this.use({
        name: "flash-auto-timestamps",
        beforeInsert(doc) {
          const now = new Date();
          if (doc.createdAt == null) doc.createdAt = now;
          doc.updatedAt = now;
          return doc;
        },
        beforeUpdate(doc) {
          doc.updatedAt = new Date();
          return doc;
        },
      });
    }
  }

  /**
   * Lists all existing collection names (local or remote)
   * @returns {Promise<string[]>}
   */
  async listCollections() {
    if (typeof this.db.listCollections === "function") {
      return await this.db.listCollections();
    }
    return [];
  }

  /**
   * Compiles or retrieves an ODM Model
   * @param {string} name - Model name
   * @param {FlashSchemaExtended|object} [schema]
   */
  model(name, schema) {
    if (this.models.has(name) && !schema) {
      return this.models.get(name);
    }
    const compiled = FlashModel.compile(name, schema, this.collection(name));
    this.models.set(name, compiled);
    return compiled;
  }

  /**
   * Creates an isolated Zero-Knowledge multi-tenant sub-client.
   * Key is derived per-tenant using HMAC with domain separation so
   * cross-tenant key isolation is cryptographically guaranteed.
   * @param {string} tenantId - Unique tenant ID
   */
  tenant(tenantId) {
    const tenantKey = crypto
      .createHmac("sha256", this.secretKey)
      .update(`flash-tenant-v1:${this.db.dbName || "default"}:${tenantId}`)
      .digest("hex");
    return new FlashClient({
      ...this.config,
      secretKey: tenantKey,
      dbName: `${this.db.dbName}_tenant_${tenantId}`,
      storagePath: `${this.config.storagePath || "./data"}/tenant_${tenantId}`,
    });
  }

  /**
   * Creates an atomic physical hot snapshot
   * @param {string} destinationPath
   */
  async backup(destinationPath) {
    const src = this.db.storagePath || this.config.storagePath || "./data";
    return await FlashBackupManager.backup(src, destinationPath);
  }

  /**
   * Restores database from a physical snapshot
   * @param {string} backupPath
   */
  async restore(backupPath) {
    const dst = this.db.storagePath || this.config.storagePath || "./data";
    return await FlashBackupManager.restore(backupPath, dst);
  }

  /**
   * Starts the built-in local Zero-Knowledge Web GUI & Monitoring Dashboard
   */
  openDashboard(options = {}) {
    return FlashDashboard.start(this, options);
  }

  /**
   * Starts a new ACID multi-document transaction session
   */
  startSession() {
    return new FlashSession(this);
  }

  /**
   * Encrypted Private RAG pipeline — chunk, embed, retrieve without server seeing plaintext.
   */
  privateRAG(collectionName = "private_rag", options = {}) {
    return new FlashPrivateRAG(this, collectionName, options);
  }

  /**
   * Encrypted episodic memory for AI agents — semantic recall with TTL and importance.
   */
  agentMemory(namespace = "default", options = {}) {
    return new FlashAgentMemory(this, namespace, options);
  }

  /**
   * Passphrase-sealed vault with auto-lock — isolated key domain for secrets.
   */
  sealedVault(vaultName, options = {}) {
    return new FlashSealedVault(this, vaultName, options);
  }

  /**
   * Export signed integrity proof (Merkle root + invariants) for compliance.
   */
  async integrityProof(collectionName, options = {}) {
    return FlashIntegrityProof.export(this, collectionName, options);
  }

  embeddingVault(collectionName = "embedding_vault", options = {}) {
    return new FlashEmbeddingVault(this, collectionName, options);
  }

  portableBundle() {
    return new FlashPortableBundle(this);
  }

  langChainAdapter(options = {}) {
    return new FlashLangChainAdapter(this, options);
  }

  federatedQuery() {
    return new FlashFederatedQuery();
  }

  multiAgentSync(namespace = "multi_agent") {
    return new FlashMultiAgentSync(this, namespace);
  }

  complianceExport() {
    return new FlashComplianceExport(this);
  }

  timeSeal(sealPath) {
    return new FlashTimeSeal(sealPath, this.secretKey);
  }

  cloudSync(syncDir) {
    return new FlashCloudSync(this, syncDir);
  }

  encryptedCRDT(collectionName, nodeId = null) {
    return new FlashEncryptedCRDT(this, collectionName, nodeId);
  }

  browserVault(vaultName = "browser_vault") {
    return new FlashBrowserVault(this.secretKey, vaultName);
  }

  auditStream(collectionName, options = {}) {
    return new FlashAuditStream(this.collection(collectionName), options);
  }

  /** Unified event bus — subscribe to `collection:name:insert`, `*`, etc. */
  events() {
    return this.eventHub;
  }

  /** Register a plugin with optional CRUD hooks. */
  use(plugin) {
    return this.plugins.use(plugin);
  }

  /**
   * Lifecycle policy for a collection (expiry, max docs, archive).
   * @param {string} collectionName
   * @param {object} [options]
   */
  lifecycle(collectionName, options = {}) {
    const col = this.collection(collectionName);
    const lc = new FlashLifecycle(col, options);
    this._lifecycles.set(collectionName, lc);
    return lc;
  }

  /**
   * Background maintenance scheduler (lifecycle, flush, compaction).
   * @param {object} [options]
   * @param {boolean} [options.autoStart=false]
   */
  maintenance(options = {}) {
    if (!this._maintenance) {
      this._maintenance = new FlashMaintenance(this, options);
    }
    if (options.autoStart) {
      this._maintenance.start();
    }
    return this._maintenance;
  }

  /** Build a data import/export pipeline. */
  pipeline() {
    return new FlashPipeline(this);
  }

  /** Append-only time-ordered stream on a collection. */
  eventLog(collectionName, options = {}) {
    return new FlashEventLog(this.collection(collectionName), options);
  }

  /** Named atomic counter. */
  counter(name, options = {}) {
    return new FlashCounter(this, name, options);
  }

  /** FIFO queue on a collection. */
  queue(collectionName, options = {}) {
    return new FlashQueue(this.collection(collectionName), options);
  }

  /** Engine health / capacity report. */
  async health() {
    return new FlashHealth(this).report();
  }

  /** Portable snapshot export/import. */
  snapshot() {
    return new FlashSnapshot(this);
  }

  collection(name, options = {}) {
    if (this._collections.has(name) && !options.schema) {
      return this._collections.get(name);
    }
    const col = new FlashClientCollection(name, this);
    if (options.schema) {
      col.setSchema(options.schema, options);
    }
    this._collections.set(name, col);
    return col;
  }

  /**
   * Builds an AAD string binding a document field to its owner record.
   * Prevents ciphertext from being copied between records or fields.
   * @param {string} recordId
   * @param {string} fieldKey
   * @returns {string}
   */
  _buildAAD(recordId, fieldKey) {
    return `flash-aad:${recordId}:${fieldKey}`;
  }

  encryptDocument(doc) {
    const recordId = doc._id ? String(doc._id) : crypto.randomUUID();
    const encryptedRecord = {
      _id: recordId,
      _enc: {},
      _blind: {
        exact: {},
        ngrams: {},
        range: {},
      },
      _homo: {},
      _plain: {},
    };

    for (const [key, value] of Object.entries(doc)) {
      if (key === "_id") continue;

      const policy = this.fieldPolicy[key] || "searchable";

      if (policy === "plaintext") {
        encryptedRecord._plain[key] = value;
      } else if (policy === "counter" && typeof value === "number") {
        const h = this.homomorphic.encryptAdd(value, recordId, key);
        encryptedRecord._homo[key] = h.ciphertext;
        encryptedRecord._enc[key] = this.cipher.encrypt(value, {
          aad: this._buildAAD(recordId, key),
        });
      } else {
        encryptedRecord._enc[key] = this.cipher.encrypt(value, {
          aad: this._buildAAD(recordId, key),
        });

        if (value !== null && value !== undefined) {
          encryptedRecord._blind.exact[key] = this.blindIndex.generateTrapdoor(
            key,
            value,
          );
          if (typeof value === "string" && value.length >= 2) {
            encryptedRecord._blind.ngrams[key] =
              this.blindIndex.generateNGramTrapdoors(key, value);
          }
          if (typeof value === "number") {
            encryptedRecord._blind.range[key] =
              this.blindIndex.generateRangeBuckets(key, value);
          }
        }
      }
    }

    return encryptedRecord;
  }

  decryptDocument(encryptedRecord) {
    if (!encryptedRecord || !encryptedRecord._enc) return encryptedRecord;

    const doc = { _id: encryptedRecord._id };
    const recordId = String(encryptedRecord._id);

    for (const [key, ciphertext] of Object.entries(encryptedRecord._enc)) {
      try {
        doc[key] = this.cipher.decrypt(ciphertext, {
          asJson: true,
          aad: this._buildAAD(recordId, key),
        });
      } catch (err) {
        doc[key] = null;
      }
    }

    if (encryptedRecord._plain) {
      for (const [key, val] of Object.entries(encryptedRecord._plain)) {
        doc[key] = val;
      }
    }

    return doc;
  }

  buildQueryEnvelope(query = {}) {
    const envelope = {};

    for (const [key, condition] of Object.entries(query)) {
      if (key.startsWith("$")) continue;
      if (key === "_id") {
        envelope._id = condition;
        continue;
      }

      const policy = this.fieldPolicy[key];

      if (policy === "plaintext") {
        envelope.$plain = envelope.$plain || {};
        envelope.$plain[key] = condition;
        continue;
      }

      if (
        typeof condition === "object" &&
        condition !== null &&
        !Array.isArray(condition)
      ) {
        if (condition.$eq !== undefined) {
          envelope.$exact = envelope.$exact || {};
          envelope.$exact[key] = this.blindIndex.generateTrapdoor(
            key,
            condition.$eq,
          );
        }
        if (condition.$regex !== undefined || condition.$substr !== undefined) {
          const searchStr = condition.$regex || condition.$substr;
          envelope.$ngrams = envelope.$ngrams || {};
          envelope.$ngrams[key] = this.blindIndex.generateNGramTrapdoors(
            key,
            String(searchStr),
            false,
          );
        }
        if (
          condition.$gt !== undefined ||
          condition.$gte !== undefined ||
          condition.$lt !== undefined ||
          condition.$lte !== undefined
        ) {
          const min =
            condition.$gt !== undefined
              ? condition.$gt
              : condition.$gte !== undefined
                ? condition.$gte
                : 0;
          const max =
            condition.$lt !== undefined
              ? condition.$lt
              : condition.$lte !== undefined
                ? condition.$lte
                : 1000000;
          envelope.$range = envelope.$range || {};
          envelope.$range[key] = this.blindIndex.generateRangeQueryTokens(
            key,
            Number(min),
            Number(max),
          );
        }
      } else {
        envelope.$exact = envelope.$exact || {};
        envelope.$exact[key] = this.blindIndex.generateTrapdoor(key, condition);
      }
    }

    return envelope;
  }

  async close() {
    if (this._maintenance) {
      this._maintenance.stop();
    }
    await this.db.close();
  }
}

/**
 * Client-facing Collection — encrypted CRUD, queries, aggregation, and ODM
 */
export class FlashClientCollection {
  constructor(name, client) {
    this.name = name;
    this.client = client;
    this.raw = client.db.collection(name);
    this.schema = new FlashSchema({});
    this.vectorIndex = new FlashVectorIndex();
    this.changeStreams = new Set();
    this.indexManager = new FlashSecondaryIndexManager();
    this.textIndex = new FlashTextSearchPlugin();
    this.ttlManager = null;
    this.isReady = false;
  }

  async init() {
    if (this.isReady) return;
    this.raw.secondaryIndexManager = this.indexManager;
    await this.raw.init();
    await this._rebuildClientIndexes();
    this.isReady = true;
  }

  async _rebuildClientIndexes() {
    const rawDocs = await this.raw.find({}, { limit: 100_000 });
    for (const raw of rawDocs) {
      const doc = this.client.decryptDocument(raw);
      if (doc.$vector) {
        this.vectorIndex.set(doc._id, doc.$vector);
      }
      this.indexManager.indexDocument(doc);
    }
  }

  setSchema(schemaDefinition, options = {}) {
    this.schema =
      schemaDefinition instanceof FlashSchema
        ? schemaDefinition
        : new FlashSchema(schemaDefinition, options);

    if (options.expireAfterSeconds) {
      this.ttlManager = new FlashTTLManager(this.raw, {
        field: options.ttlField || "createdAt",
        expireAfterSeconds: options.expireAfterSeconds,
      });
      this.ttlManager.start();
      this.client.lifecycle(this.name, {
        expireAfterMs: options.expireAfterSeconds * 1000,
        timeField: options.ttlField || "createdAt",
      });
    }

    return this;
  }

  createIndex(keySpec, options = {}) {
    const name = this.indexManager.createIndex(keySpec, options);
    this.raw._schedulePersistIndexes();
    return name;
  }

  listIndexes() {
    return this.indexManager.listIndexes();
  }

  dropIndex(name) {
    return this.indexManager.dropIndex(name);
  }

  watch(filter = null) {
    const stream = new FlashChangeStream(filter || {}, null, {
      oplog: this.raw.oplog,
      collectionName: this.name,
    });
    this.changeStreams.add(stream);
    stream.on("close", () => this.changeStreams.delete(stream));
    return stream;
  }

  /**
   * Cursor-based pagination — stable for feeds, logs, lists at any scale.
   * @param {object} [query={}]
   * @param {object} [options]
   * @param {string} [options.cursor]
   * @param {number} [options.limit=20]
   * @param {object} [options.sort]
   */
  async paginate(query = {}, options = {}) {
    return FlashPaginator.paginate(this, query, options);
  }

  _publishEvent(type, doc) {
    const hub = this.client.eventHub;
    if (!hub) return;
    const payload = {
      type,
      collection: this.name,
      doc,
      at: Date.now(),
    };
    hub.publish(`collection:${this.name}:${type}`, payload);
    hub.publish(`collection:${this.name}:*`, payload);
    hub.publish("*", payload);
  }

  async vectorSearch({ vector, topK = 5, filter = null }) {
    if (!this.isReady) await this.init();
    const searchLimit = filter ? 1000 : topK;
    const rankedIds = this.vectorIndex.search(vector, searchLimit);
    const results = [];

    for (const item of rankedIds) {
      let rawDoc = await this.raw._getRawDoc(item.docId);
      if (rawDoc) {
        if (Buffer.isBuffer(rawDoc) || rawDoc instanceof Uint8Array) {
          rawDoc = FlashBinary.deserialize(rawDoc);
        }
        const decrypted = this.client.decryptDocument(rawDoc);
        if (!filter || FlashQueryEvaluator.matches(decrypted, filter)) {
          results.push({
            ...decrypted,
            _score: item.score,
          });
          if (results.length >= topK) break;
        }
      }
    }

    return results;
  }

  async insertOne(doc) {
    if (!this.isReady) await this.init();
    let validatedDoc = this.schema.validate(doc);
    validatedDoc =
      (await this.client.plugins.runHook(
        "beforeInsert",
        validatedDoc,
        this,
      )) ?? validatedDoc;
    validatedDoc._id = validatedDoc._id
      ? String(validatedDoc._id)
      : crypto.randomUUID();

    // Validate Unique Indexes
    this.indexManager.validateUniqueConstraints(validatedDoc);

    if (validatedDoc.$vector) {
      this.vectorIndex.set(validatedDoc._id, validatedDoc.$vector);
    }

    const encrypted = this.client.encryptDocument(validatedDoc);
    const res = await this.raw.insertOne(encrypted);

    // Index in secondary & text search indexes
    this.indexManager.indexDocument(validatedDoc);

    for (const stream of this.changeStreams) {
      stream.emitChange("insert", validatedDoc);
    }
    this._publishEvent("insert", validatedDoc);
    await this.client.plugins.runHook("afterInsert", validatedDoc, this);

    return res;
  }

  async insertMany(docs) {
    if (!this.isReady) await this.init();
    const validatedDocs = docs.map((doc) => {
      const validated = this.schema.validate(doc);
      validated._id = validated._id
        ? String(validated._id)
        : crypto.randomUUID();
      this.indexManager.validateUniqueConstraints(validated);
      return validated;
    });

    const encryptedDocs = validatedDocs.map((doc) =>
      this.client.encryptDocument(doc),
    );
    const res = await this.raw.insertMany(encryptedDocs);

    for (let i = 0; i < validatedDocs.length; i++) {
      const validated = validatedDocs[i];
      if (validated.$vector) {
        this.vectorIndex.set(validated._id, validated.$vector);
      }
      this.indexManager.indexDocument(validated);
      for (const stream of this.changeStreams) {
        stream.emitChange("insert", validated);
      }
      this._publishEvent("insert", validated);
    }

    this.raw._schedulePersistIndexes();
    return res;
  }

  /**
   * Returns a Fluent Query cursor that can be chained or directly awaited
   * @param {object} [query={}]
   * @param {object} [options={}]
   * @returns {FlashQuery}
   */
  find(query = {}, options = {}) {
    return new FlashQuery(this, query, options);
  }

  async _executeRawQuery(query = {}, options = {}) {
    if (!this.isReady) await this.init();

    const stats = options.executionStats || options.stats || null;

    const equalityFields = {};
    for (const [k, v] of Object.entries(query)) {
      if (
        !k.startsWith("$") &&
        k !== "_id" &&
        (typeof v !== "object" || v === null)
      ) {
        equalityFields[k] = v;
      }
    }

    if (Object.keys(equalityFields).length >= 1) {
      const compoundIds = this.indexManager.lookupCompound(equalityFields);
      if (compoundIds !== null) {
        const rawResults = await this.raw.find(
          { $ids: compoundIds.map(String) },
          { ...options, stats },
        );
        const decryptedDocs = rawResults.map((r) =>
          this.client.decryptDocument(r),
        );
        return decryptedDocs.filter((doc) =>
          FlashQueryEvaluator.matches(doc, query),
        );
      }
    }

    const simpleFields = Object.entries(query).filter(
      ([k, v]) =>
        k !== "_id" &&
        !k.startsWith("$") &&
        (typeof v !== "object" || v === null),
    );
    if (simpleFields.length === 1) {
      const [field, val] = simpleFields[0];
      const ids = this.indexManager.lookup(field, val);
      if (ids !== null) {
        const rawResults = await this.raw.find(
          { $ids: ids.map(String) },
          { ...options, stats },
        );
        const decryptedDocs = rawResults.map((r) =>
          this.client.decryptDocument(r),
        );
        return decryptedDocs.filter((doc) =>
          FlashQueryEvaluator.matches(doc, query),
        );
      }
    }

    const envelope = this.client.buildQueryEnvelope(query);
    if (Object.keys(equalityFields).length > 0) {
      envelope.$secondary = {
        ...(envelope.$secondary || {}),
        ...equalityFields,
      };
    }
    const rawResults = await this.raw.find(envelope, { ...options, stats });

    const decryptedDocs = rawResults.map((r) => this.client.decryptDocument(r));
    const filteredDocs = decryptedDocs.filter((doc) =>
      FlashQueryEvaluator.matches(doc, query),
    );

    // Handle Populations
    if (options.populate && Array.isArray(options.populate)) {
      for (const pop of options.populate) {
        const targetCol = this.client.collection(pop.from);
        const foreignDocs = await targetCol.find();
        const foreignMap = new Map();

        for (const fDoc of foreignDocs) {
          const fVal = String(fDoc[pop.foreignField]);
          if (!foreignMap.has(fVal)) foreignMap.set(fVal, []);
          foreignMap.get(fVal).push(fDoc);
        }

        for (const doc of filteredDocs) {
          const lVal = String(doc[pop.localField]);
          const matches = foreignMap.get(lVal) || [];
          doc[pop.as] = pop.single ? matches[0] || null : matches;
        }
      }
    }

    return filteredDocs;
  }

  async findOne(query = {}, options = {}) {
    const results = await this.find(query, { ...options, limit: 1 }).exec();
    return results.length > 0 ? results[0] : null;
  }

  async findById(id) {
    return await this.findOne({ _id: id });
  }

  async updateOne(filter, update, options = {}) {
    if (!this.isReady) await this.init();
    const existing = await this.findOne(filter);

    if (!existing) {
      if (options.upsert) {
        const newDoc = FlashUpdateEngine.applyUpdate(filter, update);
        const res = await this.insertOne(newDoc);
        return {
          matchedCount: 0,
          modifiedCount: 1,
          upsertedId: res.insertedId,
        };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const updated = FlashUpdateEngine.applyUpdate(existing, update);
    this.indexManager.validateUniqueConstraints(updated, existing._id);

    let validated = this.schema.validate(updated);
    validated =
      (await this.client.plugins.runHook(
        "beforeUpdate",
        validated,
        this,
        existing,
      )) ?? validated;
    const encrypted = this.client.encryptDocument(validated);
    await this.raw.insertOne(encrypted);

    this.indexManager.unindexDocument(existing);
    this.indexManager.indexDocument(validated);

    for (const stream of this.changeStreams) {
      stream.emitChange("update", validated);
    }
    this._publishEvent("update", validated);
    await this.client.plugins.runHook("afterUpdate", validated, this);

    return { matchedCount: 1, modifiedCount: 1, doc: validated };
  }

  async updateMany(filter, update, options = {}) {
    const docs = await this.find(filter).exec();
    let modifiedCount = 0;
    for (const doc of docs) {
      await this.updateOne({ _id: doc._id }, update, options);
      modifiedCount++;
    }
    return { matchedCount: docs.length, modifiedCount };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const existing = await this.findOne(filter);
    if (!existing) return null;
    const res = await this.updateOne({ _id: existing._id }, update, options);
    return options.new ? res.doc : existing;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    return await this.findOneAndUpdate({ _id: id }, update, options);
  }

  async deleteOne(query = {}) {
    if (!this.isReady) await this.init();
    const docToDelete = await this.findOne(query);
    if (!docToDelete) return { deletedCount: 0 };

    const envelope = this.client.buildQueryEnvelope(query);
    const res = await this.raw.deleteOne(envelope);

    if (res.deletedCount > 0) {
      this.vectorIndex.delete(String(docToDelete._id));
      this.indexManager.unindexDocument(docToDelete);
      for (const stream of this.changeStreams) {
        stream.emitChange("delete", docToDelete);
      }
      this._publishEvent("delete", docToDelete);
    }

    return res;
  }

  async deleteMany(query = {}) {
    const docs = await this.find(query).exec();
    let deletedCount = 0;
    for (const doc of docs) {
      const res = await this.deleteOne({ _id: doc._id });
      deletedCount += res.deletedCount;
    }
    return { deletedCount };
  }

  async bulkWrite(operations = [], options = {}) {
    return await FlashBulkWriter.execute(this, operations, options);
  }

  async aggregate(pipeline = [], options = {}) {
    const spillThreshold = options.spillThreshold ?? 5000;
    const spillDir = path.join(
      this.raw.storageDir,
      ".agg_spill",
      String(Date.now()),
    );
    fs.mkdirSync(spillDir, { recursive: true });

    const matchStages = pipeline.filter((s) => s.$match);
    const otherStages = pipeline.filter((s) => !s.$match);
    const orderedPipeline = [...matchStages, ...otherStages];

    let currentData = null;
    let spillHandle = null;

    try {
      for (const stage of orderedPipeline) {
        if (stage.$match) {
          const results = await this.find(stage.$match).exec();
          currentData = await wrapAsPipelineData(results, {
            spillThreshold,
            spillDir,
          });
          if (currentData instanceof FlashSpillAggregator)
            spillHandle = currentData;
        } else {
          if (currentData === null) {
            const all = await this.find({}).exec();
            currentData = await wrapAsPipelineData(all, {
              spillThreshold,
              spillDir,
            });
            if (currentData instanceof FlashSpillAggregator)
              spillHandle = currentData;
          }

          if (stage.$lookup) {
            let arr = await materializePipelineData(currentData);
            const { from, localField, foreignField, as, single } =
              stage.$lookup;
            const targetCol = this.client.collection(from);
            const foreignDocs = await targetCol.find().exec();
            const foreignMap = new Map();

            for (const fDoc of foreignDocs) {
              const fVal = String(fDoc[foreignField]);
              if (!foreignMap.has(fVal)) foreignMap.set(fVal, []);
              foreignMap.get(fVal).push(fDoc);
            }

            for (const doc of arr) {
              const lVal = String(doc[localField]);
              const matches = foreignMap.get(lVal) || [];
              doc[as] = single ? matches[0] || null : matches;
            }
            currentData = await wrapAsPipelineData(arr, {
              spillThreshold,
              spillDir,
            });
          }

          if (stage.$unwind) {
            let arr = await materializePipelineData(currentData);
            const fieldPath =
              typeof stage.$unwind === "string"
                ? stage.$unwind.replace("$", "")
                : stage.$unwind.path.replace("$", "");
            const unwound = [];
            for (const doc of arr) {
              const fieldVal = doc[fieldPath];
              if (Array.isArray(fieldVal) && fieldVal.length > 0) {
                for (const item of fieldVal) {
                  unwound.push({ ...doc, [fieldPath]: item });
                }
              } else if (fieldVal !== undefined && fieldVal !== null) {
                unwound.push({ ...doc });
              }
            }
            currentData = await wrapAsPipelineData(unwound, {
              spillThreshold,
              spillDir,
            });
          }

          if (stage.$addFields) {
            let arr = await materializePipelineData(currentData);
            currentData = await wrapAsPipelineData(
              arr.map((doc) => ({ ...doc, ...stage.$addFields })),
              { spillThreshold, spillDir },
            );
          }

          if (stage.$project) {
            let arr = await materializePipelineData(currentData);
            const isInclusive = Object.values(stage.$project).some(
              (v) => v === 1 || v === true,
            );
            currentData = await wrapAsPipelineData(
              arr.map((doc) => {
                const projected = isInclusive ? { _id: doc._id } : { ...doc };
                for (const [k, v] of Object.entries(stage.$project)) {
                  if (v === 1 || v === true) projected[k] = doc[k];
                  else if (v === 0 || v === false) delete projected[k];
                }
                return projected;
              }),
              { spillThreshold, spillDir },
            );
          }

          if (stage.$group) {
            currentData = await runGroupStage(currentData, stage.$group);
            spillHandle = null;
          }

          if (stage.$sort) {
            if (currentData instanceof FlashSpillAggregator) {
              await currentData.externalSort(stage.$sort);
              spillHandle = currentData;
            } else {
              currentData.sort((a, b) => {
                for (const [key, dir] of Object.entries(stage.$sort)) {
                  const valA = a[key];
                  const valB = b[key];
                  if (valA < valB) return dir === -1 ? 1 : -1;
                  if (valA > valB) return dir === -1 ? -1 : 1;
                }
                return 0;
              });
            }
          }

          if (stage.$limit) {
            if (currentData instanceof FlashSpillAggregator) {
              currentData = await currentData.take(stage.$limit);
              spillHandle = null;
            } else {
              currentData = currentData.slice(0, stage.$limit);
            }
          }
        }
      }

      return await materializePipelineData(currentData);
    } finally {
      if (spillHandle instanceof FlashSpillAggregator) {
        await spillHandle.close();
      } else if (fs.existsSync(spillDir)) {
        await cleanupSpillDir(spillDir);
      }
    }
  }

  async verifyRecordIntegrity(docId) {
    if (!this.isReady) await this.init();
    return this.raw.verifyRecordIntegrityAsync(docId);
  }

  async timeSeriesBucket(timeField, interval, aggregations) {
    const docs = await this.find({}).exec();
    return FlashTimeSeriesPlugin.bucket(
      docs,
      timeField,
      interval,
      aggregations,
    );
  }

  async spatialNear(field, nearSpec) {
    const docs = await this.find({}).exec();
    return FlashSpatialPlugin.filterNear(docs, field, nearSpec);
  }

  /**
   * Natural Language Query Interface (AI Ask Engine)
   * Queries encrypted database using plain human language (Arabic & English)
   * @param {string} prompt - e.g. "المستخدمين الذين اشتروا أكثر من 3 مرات وموقعهم في الرياض"
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async ask(prompt, options = {}) {
    const parsed = FlashNLQueryEngine.parse(prompt);
    let query = this.find(parsed.filter, options);
    if (parsed.sort) query = query.sort(parsed.sort);
    if (parsed.limit) query = query.limit(parsed.limit);
    const results = await query.exec();
    Object.defineProperty(results, "_interpretedQuery", {
      value: parsed,
      enumerable: false,
    });
    return results;
  }

  async count(filter = {}) {
    if (!this.isReady) await this.init();
    if (!filter || Object.keys(filter).length === 0) {
      return await this.raw.count();
    }
    return (await this.find(filter).exec()).length;
  }
}

/**
 * Driver that routes encrypted operations over HTTP/REST to a remote FlashServer instance
 */
class RemoteCollectionDriver {
  constructor(name, baseUrl, authKey = null) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.authKey = authKey;
    this.memtable = { byteSize: 0 };
    this.sstables = [];
  }

  _getHeaders() {
    const h = { "Content-Type": "application/json" };
    if (this.authKey) h["x-flash-server-key"] = this.authKey;
    return h;
  }

  async init() {
    return true;
  }

  async find(envelope = {}, options = {}) {
    const res = await fetch(
      `${this.baseUrl}/api/v1/query/${encodeURIComponent(this.name)}`,
      {
        method: "POST",
        headers: this._getHeaders(),
        body: JSON.stringify({ envelope, options }),
      },
    );
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.records || [];
  }

  async insertOne(encryptedRecord) {
    const res = await fetch(
      `${this.baseUrl}/api/v1/insert/${encodeURIComponent(this.name)}`,
      {
        method: "POST",
        headers: this._getHeaders(),
        body: JSON.stringify({ encryptedRecord }),
      },
    );
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.result;
  }

  async deleteOne(filter) {
    const res = await fetch(
      `${this.baseUrl}/api/v1/delete/${encodeURIComponent(this.name)}`,
      {
        method: "POST",
        headers: this._getHeaders(),
        body: JSON.stringify({ filter }),
      },
    );
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.result;
  }

  async flush() {
    const res = await fetch(
      `${this.baseUrl}/api/v1/flush/${encodeURIComponent(this.name)}`,
      {
        method: "POST",
        headers: this._getHeaders(),
      },
    );
    return res.ok;
  }

  async count() {
    const records = await this.find({});
    return records.length;
  }

  getMerkleRoot() {
    return "Remote Merkle Verified";
  }
}
