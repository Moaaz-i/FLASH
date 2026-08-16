/**
 * FLASH In-Place Atomic Update Engine (FlashUpdateEngine)
 * Evaluates and applies atomic mutations ($set, $unset, $inc, $mul, $min, $max, $push, $pull, $addToSet, $pop, $currentDate)
 * Supports nested dot-notation paths (e.g., 'profile.address.city')
 */
export class FlashUpdateEngine {
  /**
   * Applies an update specification to a document in-place or returns a mutated clone
   * @param {object} doc - Original document
   * @param {object} updateSpec - Update operators (e.g. { $set: { ... }, $inc: { ... } })
   * @returns {object} Updated document
   */
  static applyUpdate(doc, updateSpec = {}) {
    const cloned = JSON.parse(JSON.stringify(doc));

    // If updateSpec has no operator keys ($set, $inc, etc.), it replaces the document (preserving _id)
    const hasOperators = Object.keys(updateSpec).some(k => k.startsWith('$'));
    if (!hasOperators) {
      const preservedId = cloned._id;
      const newDoc = { ...updateSpec, _id: preservedId };
      return newDoc;
    }

    // 1. $set - Set field values
    if (updateSpec.$set) {
      for (const [path, val] of Object.entries(updateSpec.$set)) {
        this._setNested(cloned, path, val);
      }
    }

    // 2. $unset - Remove fields
    if (updateSpec.$unset) {
      for (const path of Object.keys(updateSpec.$unset)) {
        this._unsetNested(cloned, path);
      }
    }

    // 3. $inc - Increment numeric values
    if (updateSpec.$inc) {
      for (const [path, incVal] of Object.entries(updateSpec.$inc)) {
        const current = this._getNested(cloned, path) || 0;
        this._setNested(cloned, path, Number(current) + Number(incVal));
      }
    }

    // 4. $mul - Multiply numeric values
    if (updateSpec.$mul) {
      for (const [path, mulVal] of Object.entries(updateSpec.$mul)) {
        const current = this._getNested(cloned, path) || 0;
        this._setNested(cloned, path, Number(current) * Number(mulVal));
      }
    }

    // 5. $min - Update if new value is smaller
    if (updateSpec.$min) {
      for (const [path, minVal] of Object.entries(updateSpec.$min)) {
        const current = this._getNested(cloned, path);
        if (current === undefined || minVal < current) {
          this._setNested(cloned, path, minVal);
        }
      }
    }

    // 6. $max - Update if new value is larger
    if (updateSpec.$max) {
      for (const [path, maxVal] of Object.entries(updateSpec.$max)) {
        const current = this._getNested(cloned, path);
        if (current === undefined || maxVal > current) {
          this._setNested(cloned, path, maxVal);
        }
      }
    }

    // 7. $currentDate - Set timestamp
    if (updateSpec.$currentDate) {
      for (const [path, type] of Object.entries(updateSpec.$currentDate)) {
        const now = new Date();
        const dateVal = (type === true || type.$type === 'date') ? now.toISOString() : Date.now();
        this._setNested(cloned, path, dateVal);
      }
    }

    // 8. $push - Append item(s) to an array
    if (updateSpec.$push) {
      for (const [path, pushSpec] of Object.entries(updateSpec.$push)) {
        let arr = this._getNested(cloned, path);
        if (!Array.isArray(arr)) arr = [];

        if (typeof pushSpec === 'object' && pushSpec !== null && pushSpec.$each && Array.isArray(pushSpec.$each)) {
          let items = [...pushSpec.$each];
          const pos = pushSpec.$position !== undefined ? pushSpec.$position : arr.length;
          arr.splice(pos, 0, ...items);
          if (pushSpec.$slice !== undefined) {
            arr = pushSpec.$slice < 0 ? arr.slice(pushSpec.$slice) : arr.slice(0, pushSpec.$slice);
          }
        } else {
          arr.push(pushSpec);
        }
        this._setNested(cloned, path, arr);
      }
    }

    // 9. $pull - Remove items from array
    if (updateSpec.$pull) {
      for (const [path, pullSpec] of Object.entries(updateSpec.$pull)) {
        let arr = this._getNested(cloned, path);
        if (Array.isArray(arr)) {
          if (typeof pullSpec === 'object' && pullSpec !== null) {
            arr = arr.filter(item => {
              if (typeof item !== 'object' || item === null) return item !== pullSpec;
              for (const [k, v] of Object.entries(pullSpec)) {
                if (item[k] === v) return false;
              }
              return true;
            });
          } else {
            arr = arr.filter(item => item !== pullSpec);
          }
          this._setNested(cloned, path, arr);
        }
      }
    }

    // 10. $addToSet - Add unique items to array
    if (updateSpec.$addToSet) {
      for (const [path, setSpec] of Object.entries(updateSpec.$addToSet)) {
        let arr = this._getNested(cloned, path);
        if (!Array.isArray(arr)) arr = [];

        const itemsToAdd = (typeof setSpec === 'object' && setSpec !== null && Array.isArray(setSpec.$each))
          ? setSpec.$each
          : [setSpec];

        for (const item of itemsToAdd) {
          const itemStr = JSON.stringify(item);
          const exists = arr.some(existing => JSON.stringify(existing) === itemStr);
          if (!exists) arr.push(item);
        }
        this._setNested(cloned, path, arr);
      }
    }

    // 11. $pop - Remove first (-1) or last (1) item
    if (updateSpec.$pop) {
      for (const [path, dir] of Object.entries(updateSpec.$pop)) {
        let arr = this._getNested(cloned, path);
        if (Array.isArray(arr) && arr.length > 0) {
          if (dir === -1) arr.shift();
          else arr.pop();
          this._setNested(cloned, path, arr);
        }
      }
    }

    return cloned;
  }

  static _getNested(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  static _setNested(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in cur) || typeof cur[part] !== 'object' || cur[part] === null) {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  static _unsetNested(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in cur)) return;
      cur = cur[parts[i]];
    }
    delete cur[parts[parts.length - 1]];
  }
}
