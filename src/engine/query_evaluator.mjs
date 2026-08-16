import { FlashFuzzyEngine } from '../crypto/fuzzy_search.mjs';

/**
 * FLASH Advanced Query Evaluator (FlashQueryEvaluator)
 * Evaluates complex nested MongoDB query filters in-memory with complete operator parity:
 * Logical ($and, $or, $nor, $not), Comparison ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin),
 * Element ($exists, $type), Array ($size, $all, $elemMatch), Evaluation ($mod, $regex, $fuzzy, $soundex).
 */
export class FlashQueryEvaluator {
  /**
   * Tests whether a document matches a complex MongoDB query
   * @param {object} doc - Plain document
   * @param {object} query - Query filter
   * @returns {boolean}
   */
  static matches(doc, query = {}) {
    if (!query || Object.keys(query).length === 0) return true;

    for (const [key, condition] of Object.entries(query)) {
      // 1. Top-Level Logical Operators
      if (key === '$and') {
        if (!Array.isArray(condition)) return false;
        for (const subQuery of condition) {
          if (!this.matches(doc, subQuery)) return false;
        }
        continue;
      }

      if (key === '$or') {
        if (!Array.isArray(condition) || condition.length === 0) return false;
        const anyMatch = condition.some(subQuery => this.matches(doc, subQuery));
        if (!anyMatch) return false;
        continue;
      }

      if (key === '$nor') {
        if (!Array.isArray(condition)) return false;
        const anyMatch = condition.some(subQuery => this.matches(doc, subQuery));
        if (anyMatch) return false;
        continue;
      }

      // 2. Field Match
      const val = this._getNested(doc, key);

      if (!this._evaluateCondition(val, condition)) {
        return false;
      }
    }

    return true;
  }

  static _evaluateCondition(val, condition) {
    // Direct primitive equality (or null/undefined)
    if (condition === null || typeof condition !== 'object' || condition instanceof RegExp || condition instanceof Date) {
      if (condition instanceof RegExp) {
        return condition.test(String(val));
      }
      return val === condition;
    }

    // Array direct comparison
    if (Array.isArray(condition)) {
      if (!Array.isArray(val)) return false;
      return JSON.stringify(val) === JSON.stringify(condition);
    }

    // Condition is an operator object: e.g. { $gt: 5, $in: [...] }
    for (const [op, opVal] of Object.entries(condition)) {
      switch (op) {
        case '$eq':
          if (val !== opVal) return false;
          break;

        case '$ne':
          if (val === opVal) return false;
          break;

        case '$gt':
          if (!(val > opVal)) return false;
          break;

        case '$gte':
          if (!(val >= opVal)) return false;
          break;

        case '$lt':
          if (!(val < opVal)) return false;
          break;

        case '$lte':
          if (!(val <= opVal)) return false;
          break;

        case '$in':
          if (!Array.isArray(opVal)) return false;
          if (Array.isArray(val)) {
            if (!val.some(item => opVal.includes(item))) return false;
          } else {
            if (!opVal.includes(val)) return false;
          }
          break;

        case '$nin':
          if (!Array.isArray(opVal)) return false;
          if (Array.isArray(val)) {
            if (val.some(item => opVal.includes(item))) return false;
          } else {
            if (opVal.includes(val)) return false;
          }
          break;

        case '$exists':
          const exists = val !== undefined;
          if (exists !== !!opVal) return false;
          break;

        case '$type':
          const actualType = Array.isArray(val) ? 'array' : (val === null ? 'null' : typeof val);
          if (actualType !== opVal) return false;
          break;

        case '$size':
          if (!Array.isArray(val) || val.length !== opVal) return false;
          break;

        case '$all':
          if (!Array.isArray(val) || !Array.isArray(opVal)) return false;
          const hasAll = opVal.every(item => val.includes(item));
          if (!hasAll) return false;
          break;

        case '$elemMatch':
          if (!Array.isArray(val)) return false;
          const matchFound = val.some(item => {
            if (typeof item === 'object' && item !== null) {
              return this.matches(item, opVal);
            }
            return this._evaluateCondition(item, opVal);
          });
          if (!matchFound) return false;
          break;

        case '$regex':
          const flags = condition.$options || 'i';
          const rx = new RegExp(opVal, flags);
          if (!rx.test(String(val))) return false;
          break;

        case '$mod':
          if (!Array.isArray(opVal) || opVal.length !== 2) return false;
          const [divisor, remainder] = opVal;
          if (Number(val) % divisor !== remainder) return false;
          break;

        case '$not':
          if (this._evaluateCondition(val, opVal)) return false;
          break;

        // Encrypted Fuzzy & Phonetic Matching
        case '$fuzzy':
          const target = (typeof opVal === 'string' ? opVal : opVal.term || '').toLowerCase();
          const maxDist = (typeof opVal === 'object' && opVal.maxDistance !== undefined) ? opVal.maxDistance : 1;
          const valStr = String(val || '').toLowerCase();

          let isFuzzy = FlashFuzzyEngine.levenshtein(valStr, target) <= maxDist;
          if (!isFuzzy && valStr.includes(target)) isFuzzy = true;
          if (!isFuzzy) {
            const words = valStr.split(/\s+/);
            for (const w of words) {
              if (FlashFuzzyEngine.levenshtein(w, target) <= maxDist) {
                isFuzzy = true;
                break;
              }
            }
          }
          if (!isFuzzy) return false;
          break;

        case '$soundex':
          const targetCode = FlashFuzzyEngine.soundex(String(opVal));
          const words = String(val || '').split(/\s+/);
          let isSoundex = FlashFuzzyEngine.soundex(String(val || '')) === targetCode;
          if (!isSoundex) {
            for (const w of words) {
              if (FlashFuzzyEngine.soundex(w) === targetCode) {
                isSoundex = true;
                break;
              }
            }
          }
          if (!isSoundex) return false;
          break;
      }
    }

    return true;
  }

  static _getNested(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[part];
    }
    return cur;
  }
}
