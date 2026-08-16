/**
 * FLASH Flexible Schema Validator (FlashSchema)
 * Allows total document flexibility by default, with optional ergonomic schema rules & default values
 */
export class FlashSchema {
  /**
   * @param {object} schemaDefinition - e.g. { name: { type: 'string', required: true, min: 2 } }
   */
  constructor(schemaDefinition = {}) {
    this.rules = schemaDefinition;
  }

  applyDefaults(doc = {}) {
    const res = { ...doc };
    for (const [field, rule] of Object.entries(this.rules)) {
      if ((res[field] === undefined || res[field] === null) && rule.default !== undefined) {
        res[field] = typeof rule.default === 'function' ? rule.default() : rule.default;
      }
    }
    return res;
  }

  /**
   * Validates and applies defaults to a document before encryption
   * @param {object} doc
   * @returns {object} Validated & sanitized document
   */
  validate(doc) {
    if (!this.rules || Object.keys(this.rules).length === 0) {
      return doc; // Schema-free mode
    }

    const sanitized = { ...doc };

    for (const [field, rule] of Object.entries(this.rules)) {
      let val = sanitized[field];

      // 1. Handle Defaults
      if ((val === undefined || val === null) && rule.default !== undefined) {
        val = typeof rule.default === 'function' ? rule.default() : rule.default;
        sanitized[field] = val;
      }

      // 2. Required Check
      if (rule.required && (val === undefined || val === null || val === '')) {
        throw new Error(`SchemaValidationError: Field "${field}" is required`);
      }

      if (val === undefined || val === null) continue;

      // 3. Type Checking
      if (rule.type) {
        const t = rule.type.toLowerCase();
        if (t === 'string' && typeof val !== 'string') {
          throw new Error(`SchemaValidationError: Field "${field}" must be a string`);
        }
        if (t === 'number' && typeof val !== 'number') {
          throw new Error(`SchemaValidationError: Field "${field}" must be a number`);
        }
        if (t === 'boolean' && typeof val !== 'boolean') {
          throw new Error(`SchemaValidationError: Field "${field}" must be a boolean`);
        }
        if (t === 'array' && !Array.isArray(val)) {
          throw new Error(`SchemaValidationError: Field "${field}" must be an array`);
        }
        if (t === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
          throw new Error(`SchemaValidationError: Field "${field}" must be an object`);
        }
      }

      // 4. Min / Max range & length
      if (typeof val === 'number') {
        if (rule.min !== undefined && val < rule.min) {
          throw new Error(`SchemaValidationError: Field "${field}" must be >= ${rule.min}`);
        }
        if (rule.max !== undefined && val > rule.max) {
          throw new Error(`SchemaValidationError: Field "${field}" must be <= ${rule.max}`);
        }
      } else if (typeof val === 'string') {
        if (rule.min !== undefined && val.length < rule.min) {
          throw new Error(`SchemaValidationError: Field "${field}" length must be >= ${rule.min}`);
        }
        if (rule.max !== undefined && val.length > rule.max) {
          throw new Error(`SchemaValidationError: Field "${field}" length must be <= ${rule.max}`);
        }
        if (rule.match && !rule.match.test(val)) {
          throw new Error(`SchemaValidationError: Field "${field}" does not match required pattern`);
        }
      }

      // 5. Enum validation
      if (rule.enum && Array.isArray(rule.enum) && !rule.enum.includes(val)) {
        throw new Error(`SchemaValidationError: Field "${field}" must be one of [${rule.enum.join(', ')}]`);
      }

      // 6. Custom Validator
      if (typeof rule.validate === 'function') {
        const res = rule.validate(val);
        if (res === false || typeof res === 'string') {
          throw new Error(`SchemaValidationError: Field "${field}" failed custom validation ${typeof res === 'string' ? `(${res})` : ''}`);
        }
      }
    }

    return sanitized;
  }
}
