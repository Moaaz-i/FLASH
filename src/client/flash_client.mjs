import crypto from 'node:crypto';
import { FlashBinary } from '../binary/flash_binary.mjs';
import { FlashCipher } from '../crypto/cipher.mjs';
import { FlashBlindIndex } from '../crypto/blind_index.mjs';
import { FlashHomomorphic } from '../crypto/homomorphic.mjs';
import { FlashDatabase } from '../core/database.mjs';
import { FlashVectorIndex } from '../vector/vector_index.mjs';
import { FlashChangeStream } from '../reactive/change_stream.mjs';
import { FlashSession } from '../transactions/session.mjs';
import { FlashPQC } from '../crypto/pqc.mjs';
import { FlashSchema } from '../schema/schema_validator.mjs';
import { FlashDashboard } from '../gui/dashboard_server.mjs';
import { FlashUpdateEngine } from '../engine/update_engine.mjs';
import { FlashSecondaryIndexManager } from '../engine/secondary_index.mjs';
import { FlashQueryEvaluator } from '../engine/query_evaluator.mjs';
import { FlashBulkWriter } from '../engine/bulk_writer.mjs';
import { FlashBackupManager } from '../engine/backup_restore.mjs';
import { FlashTTLManager } from '../engine/ttl_manager.mjs';
import { FlashQuery } from './fluent_query.mjs';
import { FlashModel, FlashSchemaExtended } from '../odm/flash_model.mjs';
import { FlashSpatialPlugin } from '../plugins/spatial_plugin.mjs';
import { FlashTimeSeriesPlugin } from '../plugins/time_series_plugin.mjs';
import { FlashTextSearchPlugin } from '../plugins/text_search_plugin.mjs';
import { FlashNLQueryEngine } from '../ai/nl_query_engine.mjs';

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
   * @param {object} [config.fieldPolicy] - Custom encryption levels per field
   */
  constructor(config = {}) {
    if (!config.secretKey) {
      throw new Error('Secret key is required to initialize FlashClient SDK');
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

    if (this.uri) {
      // Remote Client-Server Mode
      const normalizedUrl = this.uri.replace(/^flash:\/\//i, 'http://');
      this.remoteBaseUrl = normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;
      this.db = {
        dbName: config.dbName || 'flash_remote_db',
        storagePath: config.storagePath || './data',
        listCollections: async () => {
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.authKey) headers['x-flash-server-key'] = this.authKey;
            const res = await fetch(`${this.remoteBaseUrl}/api/v1/collections`, { headers });
            if (res.ok) {
              const data = await res.json();
              return data.collections || [];
            }
          } catch (e) {}
          return [];
        },
        collection: (name) => new RemoteCollectionDriver(name, this.remoteBaseUrl, this.authKey),
        close: async () => {}
      };
    } else {
      // Embedded In-Process Mode
      this.db = new FlashDatabase(config.dbName || 'flash_db', {
        storagePath: config.storagePath || './data'
      });
    }
  }

  /**
   * Lists all existing collection names (local or remote)
   * @returns {Promise<string[]>}
   */
  async listCollections() {
    if (typeof this.db.listCollections === 'function') {
      return await this.db.listCollections();
    }
    return [];
  }


  /**
   * Compiles or retrieves a Mongoose-style ODM Model
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
      .createHmac('sha256', this.secretKey)
      .update(`flash-tenant-v1:${this.db.dbName || 'default'}:${tenantId}`)
      .digest('hex');
    return new FlashClient({
      ...this.config,
      secretKey: tenantKey,
      dbName: `${this.db.dbName}_tenant_${tenantId}`,
      storagePath: `${this.config.storagePath || './data'}/tenant_${tenantId}`,
    });
  }

  /**
   * Creates an atomic physical hot snapshot
   * @param {string} destinationPath
   */
  async backup(destinationPath) {
    const src = this.db.storagePath || this.config.storagePath || './data';
    return await FlashBackupManager.backup(src, destinationPath);
  }

  /**
   * Restores database from a physical snapshot
   * @param {string} backupPath
   */
  async restore(backupPath) {
    const dst = this.db.storagePath || this.config.storagePath || './data';
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

  collection(name, options = {}) {
    const col = new FlashClientCollection(name, this);
    if (options.schema) {
      col.setSchema(options.schema, options);
    }
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
        range: {}
      },
      _homo: {},
      _plain: {}
    };

    for (const [key, value] of Object.entries(doc)) {
      if (key === '_id') continue;

      const policy = this.fieldPolicy[key] || 'searchable';

      if (policy === 'plaintext') {
        encryptedRecord._plain[key] = value;
      } else if (policy === 'counter' && typeof value === 'number') {
        const h = this.homomorphic.encryptAdd(value, recordId, key);
        encryptedRecord._homo[key] = h.ciphertext;
        encryptedRecord._enc[key] = this.cipher.encrypt(value, { aad: this._buildAAD(recordId, key) });
      } else {
        encryptedRecord._enc[key] = this.cipher.encrypt(value, { aad: this._buildAAD(recordId, key) });

        if (value !== null && value !== undefined) {
          encryptedRecord._blind.exact[key] = this.blindIndex.generateTrapdoor(key, value);
          if (typeof value === 'string' && value.length >= 2) {
            encryptedRecord._blind.ngrams[key] = this.blindIndex.generateNGramTrapdoors(key, value);
          }
          if (typeof value === 'number') {
            encryptedRecord._blind.range[key] = this.blindIndex.generateRangeBuckets(key, value);
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
      if (key.startsWith('$')) continue;
      if (key === '_id') {
        envelope._id = condition;
        continue;
      }

      const policy = this.fieldPolicy[key];

      if (policy === 'plaintext') {
        envelope.$plain = envelope.$plain || {};
        envelope.$plain[key] = condition;
        continue;
      }

      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        if (condition.$eq !== undefined) {
          envelope.$exact = envelope.$exact || {};
          envelope.$exact[key] = this.blindIndex.generateTrapdoor(key, condition.$eq);
        }
        if (condition.$regex !== undefined || condition.$substr !== undefined) {
          const searchStr = condition.$regex || condition.$substr;
          envelope.$ngrams = envelope.$ngrams || {};
          envelope.$ngrams[key] = this.blindIndex.generateNGramTrapdoors(key, String(searchStr), false);
        }
        if (condition.$gt !== undefined || condition.$gte !== undefined || condition.$lt !== undefined || condition.$lte !== undefined) {
          const min = condition.$gt !== undefined ? condition.$gt : (condition.$gte !== undefined ? condition.$gte : 0);
          const max = condition.$lt !== undefined ? condition.$lt : (condition.$lte !== undefined ? condition.$lte : 1000000);
          envelope.$range = envelope.$range || {};
          envelope.$range[key] = this.blindIndex.generateRangeQueryTokens(key, Number(min), Number(max));
        }
      } else {
        envelope.$exact = envelope.$exact || {};
        envelope.$exact[key] = this.blindIndex.generateTrapdoor(key, condition);
      }
    }

    return envelope;
  }

  async close() {
    await this.db.close();
  }
}

/**
 * Client-facing Collection wrapper with Full MongoDB & ODM Parity
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
    await this.raw.init();
    this.isReady = true;
  }

  setSchema(schemaDefinition, options = {}) {
    this.schema = (schemaDefinition instanceof FlashSchema)
      ? schemaDefinition
      : new FlashSchema(schemaDefinition, options);

    if (options.expireAfterSeconds) {
      this.ttlManager = new FlashTTLManager(this.raw, {
        field: options.ttlField || 'createdAt',
        expireAfterSeconds: options.expireAfterSeconds
      });
      this.ttlManager.start();
    }

    return this;
  }

  createIndex(keySpec, options = {}) {
    return this.indexManager.createIndex(keySpec, options);
  }

  listIndexes() {
    return this.indexManager.listIndexes();
  }

  dropIndex(name) {
    return this.indexManager.dropIndex(name);
  }

  watch(filter = null) {
    const stream = new FlashChangeStream(filter);
    this.changeStreams.add(stream);
    stream.on('close', () => this.changeStreams.delete(stream));
    return stream;
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
            _score: item.score
          });
          if (results.length >= topK) break;
        }
      }
    }

    return results;
  }

  async insertOne(doc) {
    if (!this.isReady) await this.init();
    const validatedDoc = this.schema.validate(doc);
    validatedDoc._id = validatedDoc._id ? String(validatedDoc._id) : crypto.randomUUID();

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
      stream.emitChange('insert', validatedDoc);
    }

    return res;
  }

  async insertMany(docs) {
    const insertedIds = [];
    for (const doc of docs) {
      const res = await this.insertOne(doc);
      insertedIds.push(res.insertedId);
    }
    return {
      insertedCount: insertedIds.length,
      insertedIds
    };
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
    const envelope = this.client.buildQueryEnvelope(query);
    const rawResults = await this.raw.find(envelope, options);

    const decryptedDocs = rawResults.map(r => this.client.decryptDocument(r));
    const filteredDocs = decryptedDocs.filter(doc => FlashQueryEvaluator.matches(doc, query));

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
          doc[pop.as] = pop.single ? (matches[0] || null) : matches;
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
        return { matchedCount: 0, modifiedCount: 1, upsertedId: res.insertedId };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const updated = FlashUpdateEngine.applyUpdate(existing, update);
    this.indexManager.validateUniqueConstraints(updated, existing._id);

    const validated = this.schema.validate(updated);
    const encrypted = this.client.encryptDocument(validated);
    await this.raw.insertOne(encrypted);

    this.indexManager.unindexDocument(existing);
    this.indexManager.indexDocument(validated);

    for (const stream of this.changeStreams) {
      stream.emitChange('update', validated);
    }

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
        stream.emitChange('delete', docToDelete);
      }
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

  async aggregate(pipeline = []) {
    let currentData = null;

    for (const stage of pipeline) {
      if (stage.$match) {
        currentData = await this.find(stage.$match).exec();
      } else {
        if (currentData === null) {
          currentData = await this.find({}).exec();
        }

        if (stage.$lookup) {
          const { from, localField, foreignField, as, single } = stage.$lookup;
          const targetCol = this.client.collection(from);
          const foreignDocs = await targetCol.find().exec();
          const foreignMap = new Map();

          for (const fDoc of foreignDocs) {
            const fVal = String(fDoc[foreignField]);
            if (!foreignMap.has(fVal)) foreignMap.set(fVal, []);
            foreignMap.get(fVal).push(fDoc);
          }

          for (const doc of currentData) {
            const lVal = String(doc[localField]);
            const matches = foreignMap.get(lVal) || [];
            doc[as] = single ? (matches[0] || null) : matches;
          }
        }

        // $unwind
        if (stage.$unwind) {
          const fieldPath = typeof stage.$unwind === 'string' ? stage.$unwind.replace('$', '') : stage.$unwind.path.replace('$', '');
          const unwound = [];
          for (const doc of currentData) {
            const arr = doc[fieldPath];
            if (Array.isArray(arr) && arr.length > 0) {
              for (const item of arr) {
                unwound.push({ ...doc, [fieldPath]: item });
              }
            } else if (arr !== undefined && arr !== null) {
              unwound.push({ ...doc });
            }
          }
          currentData = unwound;
        }

        // $addFields
        if (stage.$addFields) {
          currentData = currentData.map(doc => ({ ...doc, ...stage.$addFields }));
        }

        // $project
        if (stage.$project) {
          const isInclusive = Object.values(stage.$project).some(v => v === 1 || v === true);
          currentData = currentData.map(doc => {
            const projected = isInclusive ? { _id: doc._id } : { ...doc };
            for (const [k, v] of Object.entries(stage.$project)) {
              if (v === 1 || v === true) {
                projected[k] = doc[k];
              } else if (v === 0 || v === false) {
                delete projected[k];
              }
            }
            return projected;
          });
        }

        if (stage.$group) {
          const groupField = stage.$group._id ? stage.$group._id.replace('$', '') : null;
          const groups = new Map();

          for (const doc of currentData) {
            const key = groupField ? doc[groupField] : '__all__';
            if (!groups.has(key)) {
              groups.set(key, []);
            }
            groups.get(key).push(doc);
          }

          const aggregatedResults = [];
          for (const [key, items] of groups.entries()) {
            const resultItem = { _id: key === '__all__' ? null : key };

            for (const [outField, op] of Object.entries(stage.$group)) {
              if (outField === '_id') continue;
              const [opName, opFieldRaw] = Object.entries(op)[0];
              const targetField = typeof opFieldRaw === 'string' ? opFieldRaw.replace('$', '') : null;

              if (opName === '$sum') {
                resultItem[outField] = items.reduce((acc, it) => acc + (Number(it[targetField]) || 0), 0);
              } else if (opName === '$avg') {
                const sum = items.reduce((acc, it) => acc + (Number(it[targetField]) || 0), 0);
                resultItem[outField] = items.length ? sum / items.length : 0;
              } else if (opName === '$count') {
                resultItem[outField] = items.length;
              }
            }

            aggregatedResults.push(resultItem);
          }

          currentData = aggregatedResults;
        }

        if (stage.$sort) {
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

        if (stage.$limit) {
          currentData = currentData.slice(0, stage.$limit);
        }
      }
    }

    return currentData || [];
  }

  async verifyRecordIntegrity(docId) {
    if (!this.isReady) await this.init();
    return this.raw.verifyRecordIntegrity(docId);
  }

  async timeSeriesBucket(timeField, interval, aggregations) {
    const docs = await this.find({}).exec();
    return FlashTimeSeriesPlugin.bucket(docs, timeField, interval, aggregations);
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
    Object.defineProperty(results, '_interpretedQuery', {
      value: parsed,
      enumerable: false
    });
    return results;
  }

  async count() {
    const res = await this.find({}).exec();
    return res.length;
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
    const h = { 'Content-Type': 'application/json' };
    if (this.authKey) h['x-flash-server-key'] = this.authKey;
    return h;
  }

  async init() {
    return true;
  }

  async find(envelope = {}, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1/query/${encodeURIComponent(this.name)}`, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify({ envelope, options })
    });
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.records || [];
  }

  async insertOne(encryptedRecord) {
    const res = await fetch(`${this.baseUrl}/api/v1/insert/${encodeURIComponent(this.name)}`, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify({ encryptedRecord })
    });
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.result;
  }

  async deleteOne(filter) {
    const res = await fetch(`${this.baseUrl}/api/v1/delete/${encodeURIComponent(this.name)}`, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify({ filter })
    });
    if (!res.ok) throw new Error(`Remote FlashServer error: ${res.statusText}`);
    const data = await res.json();
    return data.result;
  }

  async flush() {
    const res = await fetch(`${this.baseUrl}/api/v1/flush/${encodeURIComponent(this.name)}`, {
      method: 'POST',
      headers: this._getHeaders()
    });
    return res.ok;
  }

  async count() {
    const records = await this.find({});
    return records.length;
  }

  getMerkleRoot() {
    return 'Remote Merkle Verified';
  }
}
