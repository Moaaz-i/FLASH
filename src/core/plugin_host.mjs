/**
 * Register extensions that hook into client lifecycle and CRUD.
 *
 * @example
 * client.use({
 *   name: 'timestamps',
 *   beforeInsert(doc) {
 *     doc.createdAt = doc.createdAt || new Date();
 *     return doc;
 *   },
 * });
 */
export class FlashPluginHost {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
    /** @type {Array<object>} */
    this.plugins = [];
  }

  use(plugin) {
    if (!plugin?.name) {
      throw new Error("Plugin must define a name property");
    }
    this.plugins.push(plugin);
    if (typeof plugin.onRegister === "function") {
      plugin.onRegister(this.client);
    }
    return this;
  }

  async runHook(hook, ...args) {
    let current = args[0];
    for (const plugin of this.plugins) {
      if (typeof plugin[hook] !== "function") continue;
      const result = await plugin[hook](...args);
      if (result !== undefined) {
        current = result;
        args[0] = result;
      }
    }
    return current;
  }
}
