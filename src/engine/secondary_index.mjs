/**
 * Custom Error for Unique Index Violations
 */
export class DuplicateKeyError extends Error {
  constructor(field, value, indexName) {
    super(`E11000 duplicate key error: Index '${indexName}' already contains value '${value}' on field '${field}'`);
    this.name = 'DuplicateKeyError';
    this.code = 11000;
    this.keyPattern = { [field]: 1 };
    this.keyValue = { [field]: value };
  }
}

/**
 * FLASH Secondary & Compound Index Manager (FlashSecondaryIndexManager)
 * Fast in-memory B-Tree/Hash indexing with Unique Constraint verification & Roaring-style bitsets
 */
export class FlashSecondaryIndexManager {
  constructor() {
    // indexName -> { spec: { field: 1 }, options: { unique: true }, map: Map<indexKey, Set<docId>> }
    this.indexes = new Map();
  }

  /**
   * Defines a secondary or compound index
   * @param {object} keySpec - e.g. { email: 1 } or { tenantId: 1, username: 1 }
   * @param {object} [options] - e.g. { unique: true, name: 'email_idx' }
   */
  createIndex(keySpec, options = {}) {
    const fields = Object.keys(keySpec);
    const indexName = options.name || fields.map(f => `${f}_${keySpec[f]}`).join('_');

    if (this.indexes.has(indexName)) {
      return indexName;
    }

    this.indexes.set(indexName, {
      name: indexName,
      spec: keySpec,
      fields,
      unique: !!options.unique,
      sparse: !!options.sparse,
      ttl: options.expireAfterSeconds || null,
      map: new Map() // indexKey -> Set<docId>
    });

    return indexName;
  }

  /**
   * Generates index key string for document
   */
  _buildKey(indexMeta, doc) {
    const vals = indexMeta.fields.map(f => {
      const v = doc[f];
      return v !== undefined ? JSON.stringify(v) : '__null__';
    });
    return vals.join('|');
  }

  /**
   * Validates unique constraints before writing a new document
   * @param {object} doc
   * @param {string} [excludeDocId] - When updating an existing document
   */
  validateUniqueConstraints(doc, excludeDocId = null) {
    for (const index of this.indexes.values()) {
      if (!index.unique) continue;

      const key = this._buildKey(index, doc);
      if (key.includes('__null__') && index.sparse) continue;

      const existingIds = index.map.get(key);
      if (existingIds && existingIds.size > 0) {
        for (const id of existingIds) {
          if (id !== excludeDocId && id !== doc._id) {
            const firstField = index.fields[0];
            throw new DuplicateKeyError(firstField, doc[firstField], index.name);
          }
        }
      }
    }
  }

  /**
   * Indexes a newly inserted document
   * @param {object} doc
   */
  indexDocument(doc) {
    this.validateUniqueConstraints(doc);

    for (const index of this.indexes.values()) {
      const key = this._buildKey(index, doc);
      if (!index.map.has(key)) {
        index.map.set(key, new Set());
      }
      index.map.get(key).add(doc._id);
    }
  }

  /**
   * Removes document entries from all indexes
   * @param {object} doc
   */
  unindexDocument(doc) {
    for (const index of this.indexes.values()) {
      const key = this._buildKey(index, doc);
      const set = index.map.get(key);
      if (set) {
        set.delete(doc._id);
        if (set.size === 0) index.map.delete(key);
      }
    }
  }

  /**
   * Look up document IDs by exact field value
   */
  lookup(field, value) {
    for (const index of this.indexes.values()) {
      if (index.fields.length === 1 && index.fields[0] === field) {
        const key = JSON.stringify(value);
        const ids = index.map.get(key);
        return ids ? Array.from(ids) : [];
      }
    }
    return null;
  }

  /**
   * Compound / prefix index lookup from equality query fields.
   * @param {object} queryFields - e.g. { tenantId: 't1', status: 'active' }
   */
  lookupCompound(queryFields) {
    const fields = Object.keys(queryFields).filter((k) => !k.startsWith("$"));
    if (fields.length === 0) return null;

    let best = null;
    for (const index of this.indexes.values()) {
      const prefix = index.fields.filter((f) => fields.includes(f));
      if (prefix.length === 0) continue;
      const ordered = index.fields.every(
        (f, i) => i >= prefix.length || fields.includes(f),
      );
      if (!ordered) continue;

      const keyParts = index.fields.map((f) =>
        queryFields[f] !== undefined
          ? JSON.stringify(queryFields[f])
          : "__null__",
      );
      const key = keyParts.join("|");
      const ids = index.map.get(key);
      if (!ids) continue;

      if (!best || index.fields.length > best.fields.length) {
        best = {
          indexName: index.name,
          fields: [...index.fields],
          ids: Array.from(ids),
          covered: index.fields.length === fields.length,
        };
      }
    }

    return best ? best.ids : null;
  }

  /**
   * Pick best secondary index for a query envelope $secondary map.
   */
  findBestIndexForQuery(secondaryQuery) {
    const fields = Object.keys(secondaryQuery);
    if (fields.length === 0) return null;

    for (const index of this.indexes.values()) {
      const matches = index.fields.every((f) => secondaryQuery[f] !== undefined);
      if (!matches) continue;
      const key = index.fields
        .map((f) => JSON.stringify(secondaryQuery[f]))
        .join("|");
      const ids = index.map.get(key);
      return {
        indexName: index.name,
        fields: index.fields,
        covered: index.fields.length === fields.length,
        count: ids ? ids.size : 0,
      };
    }
    return null;
  }

  listIndexes() {
    return Array.from(this.indexes.values()).map(idx => ({
      name: idx.name,
      key: idx.spec,
      unique: idx.unique,
      sparse: idx.sparse
    }));
  }

  dropIndex(name) {
    return this.indexes.delete(name);
  }
}
