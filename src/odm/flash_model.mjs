import { FlashSchema } from '../schema/schema_validator.mjs';

/**
 * Extended FlashSchema with Pre/Post Middleware Hooks, Virtuals, Instance Methods, & Statics
 */
export class FlashSchemaExtended extends FlashSchema {
  constructor(definition = {}, options = {}) {
    super(definition, options);
    this.hooks = {
      pre: new Map(),  // action -> Array<fn>
      post: new Map()  // action -> Array<fn>
    };
    this.virtuals = new Map(); // name -> { getter, setter }
    this.methods = {};
    this.statics = {};
    this.options = options;
  }

  /**
   * Registers a Pre-middleware hook (e.g. 'save', 'validate', 'remove')
   * @param {string} action
   * @param {Function} fn - async function(next)
   */
  pre(action, fn) {
    if (!this.hooks.pre.has(action)) this.hooks.pre.set(action, []);
    this.hooks.pre.get(action).push(fn);
    return this;
  }

  /**
   * Registers a Post-middleware hook
   * @param {string} action
   * @param {Function} fn - async function(doc)
   */
  post(action, fn) {
    if (!this.hooks.post.has(action)) this.hooks.post.set(action, []);
    this.hooks.post.get(action).push(fn);
    return this;
  }

  /**
   * Defines a virtual computed field
   * @param {string} name
   */
  virtual(name) {
    const virtualObj = {
      name,
      getter: null,
      setter: null,
      get(fn) { this.getter = fn; return this; },
      set(fn) { this.setter = fn; return this; }
    };
    this.virtuals.set(name, virtualObj);
    return virtualObj;
  }
}

/**
 * FLASH ODM Model & Active Record Document Instance
 */
export class FlashModel {
  /**
   * Factory creating a dynamic Model class bound to a collection and schema
   * @param {string} modelName
   * @param {FlashSchemaExtended|object} schema
   * @param {import('../client/flash_client.mjs').FlashClientCollection} collection
   */
  static compile(modelName, schema, collection) {
    const schemaInstance = (schema instanceof FlashSchemaExtended)
      ? schema
      : new FlashSchemaExtended(schema);

    class DocumentModel {
      constructor(data = {}) {
        Object.assign(this, schemaInstance.applyDefaults(data));
        this._isNew = !this._id;
        this._collection = collection;
        this._schema = schemaInstance;

        // Attach custom instance methods
        for (const [methodName, fn] of Object.entries(schemaInstance.methods)) {
          this[methodName] = fn.bind(this);
        }

        // Attach virtual getters
        for (const [vName, vMeta] of schemaInstance.virtuals.entries()) {
          if (vMeta.getter) {
            Object.defineProperty(this, vName, {
              get: () => vMeta.getter.call(this),
              set: (val) => { if (vMeta.setter) vMeta.setter.call(this, val); },
              enumerable: true
            });
          }
        }
      }

      /**
       * Validates document against schema
       */
      async validate() {
        // Execute Pre-validate hooks
        const preHooks = this._schema.hooks.pre.get('validate') || [];
        for (const hook of preHooks) {
          await hook.call(this);
        }

        const valid = this._schema.validate(this);
        if (!valid) {
          throw new Error(`ValidationError: ${this._schema.errors.join(', ')}`);
        }
      }

      /**
       * Saves or updates the document to FLASH DB
       */
      async save() {
        await this.validate();

        // Execute Pre-save hooks
        const preHooks = this._schema.hooks.pre.get('save') || [];
        for (const hook of preHooks) {
          await hook.call(this);
        }

        // Extract pure data object (excluding private fields, functions, and virtuals)
        const docData = {};
        for (const [k, v] of Object.entries(this)) {
          if ((!k.startsWith('_') || k === '_id') && typeof v !== 'function' && !this._schema.virtuals.has(k)) {
            docData[k] = v;
          }
        }

        if (this._isNew) {
          const res = await this._collection.insertOne(docData);
          this._id = res.insertedId;
          this._isNew = false;
        } else {
          await this._collection.updateOne({ _id: this._id }, { $set: docData });
        }

        // Execute Post-save hooks
        const postHooks = this._schema.hooks.post.get('save') || [];
        for (const hook of postHooks) {
          await hook.call(this, this);
        }

        return this;
      }

      /**
       * Deletes the document from FLASH DB
       */
      async remove() {
        if (!this._id) return;
        const preHooks = this._schema.hooks.pre.get('remove') || [];
        for (const hook of preHooks) {
          await hook.call(this);
        }

        await this._collection.deleteOne({ _id: this._id });

        const postHooks = this._schema.hooks.post.get('remove') || [];
        for (const hook of postHooks) {
          await hook.call(this, this);
        }
      }

      toJSON() {
        const obj = {};
        for (const [k, v] of Object.entries(this)) {
          if (!k.startsWith('_') || k === '_id') {
            obj[k] = v;
          }
        }
        return obj;
      }
    }

    // Static Model Methods (MongoDB/Mongoose parity)
    DocumentModel.modelName = modelName;
    DocumentModel.schema = schemaInstance;
    DocumentModel.collection = collection;

    DocumentModel.create = async function(docs) {
      if (Array.isArray(docs)) {
        const instances = docs.map(d => new DocumentModel(d));
        for (const inst of instances) await inst.save();
        return instances;
      }
      const instance = new DocumentModel(docs);
      await instance.save();
      return instance;
    };

    DocumentModel.find = function(filter = {}, options = {}) {
      const q = collection.find(filter, options);
      return q;
    };

    DocumentModel.findOne = async function(filter = {}, options = {}) {
      const doc = await collection.findOne(filter, options);
      return doc ? new DocumentModel(doc) : null;
    };

    DocumentModel.findById = async function(id) {
      return await DocumentModel.findOne({ _id: id });
    };

    DocumentModel.updateOne = async function(filter, update, options) {
      return await collection.updateOne(filter, update, options);
    };

    DocumentModel.updateMany = async function(filter, update, options) {
      return await collection.updateMany(filter, update, options);
    };

    DocumentModel.deleteOne = async function(filter) {
      return await collection.deleteOne(filter);
    };

    DocumentModel.deleteMany = async function(filter) {
      return await collection.deleteMany(filter);
    };

    DocumentModel.countDocuments = async function(filter) {
      return await collection.find(filter).countDocuments();
    };

    // Attach custom static methods
    for (const [staticName, fn] of Object.entries(schemaInstance.statics)) {
      DocumentModel[staticName] = fn.bind(DocumentModel);
    }

    return DocumentModel;
  }
}
