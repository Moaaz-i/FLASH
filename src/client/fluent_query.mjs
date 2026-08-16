import { FlashExplain } from '../engine/explain.mjs';

/**
 * FLASH Fluent Chaining Query Cursor (FlashQuery)
 * Provides Mongoose/MongoDB method chaining: .sort(), .limit(), .skip(), .select(), .where(), .stream(), .lean()
 * Implements Promise-like thenable so it can be awaited directly: const docs = await col.find().sort({ age: -1 })
 */
export class FlashQuery {
  /**
   * @param {import('./flash_client.mjs').FlashClientCollection} collection
   * @param {object} [filter={}]
   * @param {object} [options={}]
   */
  constructor(collection, filter = {}, options = {}) {
    this.collection = collection;
    this.filterCriteria = { ...filter };
    this.options = { ...options };
    this._sortSpec = null;
    this._projection = null;
    this._limit = null;
    this._skip = null;
    this._isLean = true;
    this._explainMode = false;
    this._currentField = null;
  }

  /**
   * Sorts query results by field specification
   * @param {object|string} spec - e.g. { age: -1, name: 1 } or '-age name'
   */
  sort(spec) {
    if (typeof spec === 'string') {
      const parts = spec.trim().split(/\s+/);
      this._sortSpec = {};
      for (const p of parts) {
        if (p.startsWith('-')) this._sortSpec[p.slice(1)] = -1;
        else this._sortSpec[p] = 1;
      }
    } else {
      this._sortSpec = spec;
    }
    return this;
  }

  /**
   * Limits maximum number of returned documents
   * @param {number} n
   */
  limit(n) {
    this._limit = Number(n);
    return this;
  }

  /**
   * Skips initial documents
   * @param {number} n
   */
  skip(n) {
    this._skip = Number(n);
    return this;
  }

  /**
   * Specifies fields to include or exclude (Projection)
   * @param {object|string} spec - e.g. { name: 1, email: 1 } or 'name email'
   */
  select(spec) {
    if (typeof spec === 'string') {
      const parts = spec.trim().split(/\s+/);
      this._projection = {};
      for (const p of parts) {
        if (p.startsWith('-')) this._projection[p.slice(1)] = 0;
        else this._projection[p] = 1;
      }
    } else {
      this._projection = spec;
    }
    return this;
  }

  /**
   * Fluent field targeter for chaining conditions (.where('age').gte(18))
   * @param {string} field
   */
  where(field) {
    this._currentField = field;
    return this;
  }

  equals(val) {
    if (!this._currentField) throw new Error('where() must be called before equals()');
    this.filterCriteria[this._currentField] = val;
    return this;
  }

  gt(val) {
    if (!this._currentField) throw new Error('where() must be called before gt()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $gt: val };
    return this;
  }

  gte(val) {
    if (!this._currentField) throw new Error('where() must be called before gte()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $gte: val };
    return this;
  }

  lt(val) {
    if (!this._currentField) throw new Error('where() must be called before lt()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $lt: val };
    return this;
  }

  lte(val) {
    if (!this._currentField) throw new Error('where() must be called before lte()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $lte: val };
    return this;
  }

  in(arr) {
    if (!this._currentField) throw new Error('where() must be called before in()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $in: arr };
    return this;
  }

  nin(arr) {
    if (!this._currentField) throw new Error('where() must be called before nin()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $nin: arr };
    return this;
  }

  regex(pattern) {
    if (!this._currentField) throw new Error('where() must be called before regex()');
    this.filterCriteria[this._currentField] = { ...this.filterCriteria[this._currentField], $regex: pattern };
    return this;
  }

  lean(isLean = true) {
    this._isLean = isLean;
    return this;
  }

  explain(verbosity = 'executionStats') {
    this._explainMode = true;
    return this;
  }

  async countDocuments() {
    const docs = await this.exec();
    return Array.isArray(docs) ? docs.length : 0;
  }

  /**
   * Creates an asynchronous generator stream yielding decrypted documents in chunks
   */
  async *stream(batchSize = 50) {
    const docs = await this.exec();
    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      for (const doc of chunk) {
        yield doc;
      }
    }
  }

  [Symbol.asyncIterator]() {
    return this.stream();
  }

  /**
   * Executes the query and returns processed array of documents
   */
  async exec() {
    const start = performance.now();
    const rawResults = await this.collection._executeRawQuery(this.filterCriteria, {
      ...this.options,
      limit: 100000
    });

    let docs = rawResults;

    // Apply Sorting
    if (this._sortSpec) {
      docs.sort((a, b) => {
        for (const [key, dir] of Object.entries(this._sortSpec)) {
          const valA = a[key];
          const valB = b[key];
          if (valA < valB) return dir === -1 ? 1 : -1;
          if (valA > valB) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    // Apply Skip
    if (this._skip && this._skip > 0) {
      docs = docs.slice(this._skip);
    }

    // Apply Limit
    if (this._limit && this._limit > 0) {
      docs = docs.slice(0, this._limit);
    }

    // Apply Projection (Select)
    if (this._projection) {
      const isInclusive = Object.values(this._projection).some(v => v === 1 || v === true);
      docs = docs.map(doc => {
        const projected = isInclusive ? { _id: doc._id } : { ...doc };
        for (const [k, v] of Object.entries(this._projection)) {
          if (v === 1 || v === true) {
            projected[k] = doc[k];
          } else if (v === 0 || v === false) {
            delete projected[k];
          }
        }
        return projected;
      });
    }

    const duration = performance.now() - start;

    if (this._explainMode) {
      return FlashExplain.analyze(this.collection.name, this.filterCriteria, this.options, docs, duration);
    }

    return docs;
  }

  /**
   * Thenable interface allowing direct awaiting: `await col.find().sort(...)`
   */
  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}
