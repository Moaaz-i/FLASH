import fs from 'node:fs';
import path from 'node:path';

/**
 * Persists blind + secondary indexes and doc-id registry to disk.
 */
export class FlashIndexPersistence {
  static blindPath(storageDir) {
    return path.join(storageDir, 'blind.idx.json');
  }

  static secondaryPath(storageDir) {
    return path.join(storageDir, 'secondary.idx.json');
  }

  static docIdsPath(storageDir) {
    return path.join(storageDir, 'docids.json');
  }

  static serializeBlind(indexManager) {
    const exact = {};
    for (const [field, fieldMap] of indexManager.exactIndexes.entries()) {
      exact[field] = {};
      for (const [trapdoor, ids] of fieldMap.entries()) {
        exact[field][trapdoor] = Array.from(ids);
      }
    }

    const ngrams = {};
    for (const [field, fieldMap] of indexManager.ngramIndexes.entries()) {
      ngrams[field] = {};
      for (const [token, ids] of fieldMap.entries()) {
        ngrams[field][token] = Array.from(ids);
      }
    }

    const range = {};
    for (const [field, fieldMap] of indexManager.rangeIndexes.entries()) {
      range[field] = {};
      for (const [token, ids] of fieldMap.entries()) {
        range[field][token] = Array.from(ids);
      }
    }

    return { exact, ngrams, range };
  }

  static deserializeBlind(indexManager, data) {
    if (!data) return;
    indexManager.exactIndexes.clear();
    indexManager.ngramIndexes.clear();
    indexManager.rangeIndexes.clear();

    for (const [field, trapdoors] of Object.entries(data.exact || {})) {
      const fieldMap = new Map();
      for (const [trapdoor, ids] of Object.entries(trapdoors)) {
        fieldMap.set(trapdoor, new Set(ids));
      }
      indexManager.exactIndexes.set(field, fieldMap);
    }

    for (const [field, tokens] of Object.entries(data.ngrams || {})) {
      const fieldMap = new Map();
      for (const [token, ids] of Object.entries(tokens)) {
        fieldMap.set(token, new Set(ids));
      }
      indexManager.ngramIndexes.set(field, fieldMap);
    }

    for (const [field, tokens] of Object.entries(data.range || {})) {
      const fieldMap = new Map();
      for (const [token, ids] of Object.entries(tokens)) {
        fieldMap.set(token, new Set(ids));
      }
      indexManager.rangeIndexes.set(field, fieldMap);
    }
  }

  static serializeSecondary(secondaryManager) {
    const indexes = [];
    for (const index of secondaryManager.indexes.values()) {
      const entries = {};
      for (const [key, ids] of index.map.entries()) {
        entries[key] = Array.from(ids);
      }
      indexes.push({
        name: index.name,
        spec: index.spec,
        fields: index.fields,
        unique: index.unique,
        sparse: index.sparse,
        ttl: index.ttl,
        entries
      });
    }
    return { indexes };
  }

  static deserializeSecondary(secondaryManager, data) {
    if (!data) return;
    secondaryManager.indexes.clear();
    for (const idx of data.indexes || []) {
      const map = new Map();
      for (const [key, ids] of Object.entries(idx.entries || {})) {
        map.set(key, new Set(ids));
      }
      secondaryManager.indexes.set(idx.name, {
        name: idx.name,
        spec: idx.spec,
        fields: idx.fields,
        unique: idx.unique,
        sparse: idx.sparse,
        ttl: idx.ttl,
        map
      });
    }
  }

  static async save(storageDir, { indexManager, secondaryManager, docIds }) {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const writes = [
      fs.promises.writeFile(
        this.blindPath(storageDir),
        JSON.stringify(this.serializeBlind(indexManager))
      ),
      fs.promises.writeFile(
        this.docIdsPath(storageDir),
        JSON.stringify(Array.from(docIds))
      )
    ];

    if (secondaryManager) {
      writes.push(
        fs.promises.writeFile(
          this.secondaryPath(storageDir),
          JSON.stringify(this.serializeSecondary(secondaryManager))
        )
      );
    }

    await Promise.all(writes);
  }

  static async load(storageDir, { indexManager, secondaryManager }) {
    if (!fs.existsSync(storageDir)) return;

    try {
      const blindRaw = await fs.promises.readFile(this.blindPath(storageDir), 'utf-8');
      this.deserializeBlind(indexManager, JSON.parse(blindRaw));
    } catch {}

    if (secondaryManager) {
      try {
        const secRaw = await fs.promises.readFile(this.secondaryPath(storageDir), 'utf-8');
        this.deserializeSecondary(secondaryManager, JSON.parse(secRaw));
      } catch {}
    }

    try {
      const idsRaw = await fs.promises.readFile(this.docIdsPath(storageDir), 'utf-8');
      return JSON.parse(idsRaw);
    } catch {
      return null;
    }
  }
}
