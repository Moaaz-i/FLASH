/**
 * Federated query — merge decrypted results from multiple FLASH clients.
 * Each peer holds its own keys; coordinator never sees plaintext.
 */
export class FlashFederatedQuery {
  constructor() {
    /** @type {Array<{ name: string, client: import('../client/flash_client.mjs').FlashClient }>} */
    this.peers = [];
  }

  addPeer(name, client) {
    this.peers.push({ name, client });
    return this;
  }

  async find(collectionName, filter = {}, options = {}) {
    const limit = options.limit ?? 100;
    const merged = [];

    for (const peer of this.peers) {
      const col = peer.client.collection(collectionName);
      const docs = await col.find(filter).limit(limit).exec();
      for (const doc of docs) {
        merged.push({ ...doc, _peer: peer.name });
      }
    }

    if (options.sort) {
      const [field, dir] = Object.entries(options.sort)[0] || [];
      if (field) {
        merged.sort((a, b) => {
          if (a[field] < b[field]) return dir === -1 ? 1 : -1;
          if (a[field] > b[field]) return dir === -1 ? -1 : 1;
          return 0;
        });
      }
    }

    return merged.slice(0, limit);
  }

  async count(collectionName, filter = {}) {
    let total = 0;
    for (const peer of this.peers) {
      const col = peer.client.collection(collectionName);
      const docs = await col.find(filter).exec();
      total += docs.length;
    }
    return total;
  }
}
