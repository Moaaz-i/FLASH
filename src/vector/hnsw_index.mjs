/**
 * FLASH HNSW Vector Index Engine (FlashHNSWIndex)
 * Hierarchical Navigable Small World Graph for O(log N) Approximate Nearest Neighbor (ANN) search
 * Optimized for AI Vector Embeddings, LLM Context Retrieval, and Private RAG.
 */

export class FlashHNSWIndex {
  /**
   * @param {object} [options]
   * @param {number} [options.M=16] - Max number of outgoing connections per node in graph layers
   * @param {number} [options.efConstruction=64] - Size of dynamic candidate list during construction
   * @param {number} [options.efSearch=32] - Size of dynamic candidate list during search
   * @param {number} [options.mL=0.62] - Normalization factor for layer generation (1/ln(M))
   * @param {'cosine'|'euclidean'|'dot'} [options.metric='cosine']
   */
  constructor(options = {}) {
    this.M = options.M || 16;
    this.M0 = this.M * 2; // Layer 0 holds more connections
    this.efConstruction = options.efConstruction || 64;
    this.efSearch = options.efSearch || 32;
    this.mL = options.mL || (1 / Math.log(this.M));
    this.metric = options.metric || 'cosine';

    // Node storage
    // id -> { id: string, vector: Float32Array, level: number, neighbors: Map<number, Set<string>> }
    this.nodes = new Map();
    this.entryPointId = null;
    this.maxLevel = -1;
  }

  /**
   * Distance computation between two vectors
   * @param {Float32Array} a
   * @param {Float32Array} b
   * @returns {number} Distance (lower is closer)
   */
  distance(a, b) {
    if (a.length !== b.length) return Infinity;

    if (this.metric === 'cosine') {
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const len = a.length;
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      if (normA === 0 || normB === 0) return 1.0;
      const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
      // Distance is (1 - cosine_similarity) normalized to [0, 2]
      return Math.max(0, 1 - similarity);
    } else if (this.metric === 'euclidean') {
      let sum = 0;
      const len = a.length;
      for (let i = 0; i < len; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
      }
      return Math.sqrt(sum);
    } else { // dot product distance
      let dot = 0;
      const len = a.length;
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
      }
      return -dot;
    }
  }

  /**
   * Generates random level for a new node
   * @returns {number}
   */
  _getRandomLevel() {
    const r = Math.random();
    if (r === 0) return 0;
    return Math.floor(-Math.log(r) * this.mL);
  }

  /**
   * Inserts a vector into the HNSW graph
   * @param {string} id - Document or Vector ID
   * @param {Array<number>|Float32Array} vector
   */
  insert(id, vector) {
    const docId = String(id);
    const vec = vector instanceof Float32Array ? vector : new Float32Array(vector);
    const nodeLevel = this._getRandomLevel();

    const newNode = {
      id: docId,
      vector: vec,
      level: nodeLevel,
      neighbors: new Map() // level -> Set<string>
    };

    for (let l = 0; l <= nodeLevel; l++) {
      newNode.neighbors.set(l, new Set());
    }

    if (this.entryPointId === null) {
      this.entryPointId = docId;
      this.maxLevel = nodeLevel;
      this.nodes.set(docId, newNode);
      return;
    }

    let currObj = this.nodes.get(this.entryPointId);
    let currDist = this.distance(vec, currObj.vector);

    // 1. Search entry point from top level down to nodeLevel + 1
    for (let level = this.maxLevel; level > nodeLevel; level--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighbors = currObj.neighbors.get(level) || new Set();
        for (const nId of neighbors) {
          const neighbor = this.nodes.get(nId);
          if (!neighbor) continue;
          const dist = this.distance(vec, neighbor.vector);
          if (dist < currDist) {
            currDist = dist;
            currObj = neighbor;
            changed = true;
          }
        }
      }
    }

    // 2. Insert and connect at levels min(maxLevel, nodeLevel) down to 0
    let enterNodes = [currObj];
    const topLevel = Math.min(this.maxLevel, nodeLevel);

    for (let level = topLevel; level >= 0; level--) {
      // Find efConstruction nearest neighbors at current level
      const candidates = this._searchLayer(vec, enterNodes, this.efConstruction, level);
      
      // Select M neighbors to connect
      const maxM = level === 0 ? this.M0 : this.M;
      const neighborsToConnect = candidates.slice(0, maxM);

      for (const cand of neighborsToConnect) {
        const neighbor = this.nodes.get(cand.id);
        if (!neighbor) continue;

        // Add bidirectional connection
        newNode.neighbors.get(level).add(neighbor.id);
        if (!neighbor.neighbors.has(level)) {
          neighbor.neighbors.set(level, new Set());
        }
        neighbor.neighbors.get(level).add(newNode.id);

        // Shrink neighbor connections if exceeding maxM
        if (neighbor.neighbors.get(level).size > maxM) {
          this._shrinkConnections(neighbor, level, maxM);
        }
      }

      enterNodes = candidates.map(c => this.nodes.get(c.id)).filter(Boolean);
    }

    this.nodes.set(docId, newNode);

    if (nodeLevel > this.maxLevel) {
      this.maxLevel = nodeLevel;
      this.entryPointId = docId;
    }
  }

  /**
   * Search nearest neighbors in a specific layer
   */
  _searchLayer(queryVec, enterNodes, ef, level) {
    const visited = new Set();
    const candidates = []; // Min-heap like: elements with { id, dist }
    const results = [];    // Max-heap like of closest found

    for (const en of enterNodes) {
      if (!en) continue;
      const dist = this.distance(queryVec, en.vector);
      visited.add(en.id);
      candidates.push({ id: en.id, dist });
      results.push({ id: en.id, dist });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    results.sort((a, b) => a.dist - b.dist);

    while (candidates.length > 0) {
      const current = candidates.shift(); // Nearest candidate
      const furthestResult = results[results.length - 1];

      if (current.dist > furthestResult.dist && results.length >= ef) {
        break;
      }

      const currNode = this.nodes.get(current.id);
      if (!currNode) continue;
      const neighbors = currNode.neighbors.get(level) || new Set();

      for (const nId of neighbors) {
        if (!visited.has(nId)) {
          visited.add(nId);
          const neighbor = this.nodes.get(nId);
          if (!neighbor) continue;

          const dist = this.distance(queryVec, neighbor.vector);
          const worstResult = results[results.length - 1];

          if (dist < worstResult.dist || results.length < ef) {
            candidates.push({ id: nId, dist });
            candidates.sort((a, b) => a.dist - b.dist);

            results.push({ id: nId, dist });
            results.sort((a, b) => a.dist - b.dist);

            if (results.length > ef) {
              results.pop(); // Remove furthest
            }
          }
        }
      }
    }

    return results;
  }

  _shrinkConnections(node, level, maxM) {
    const neighborSet = node.neighbors.get(level);
    if (!neighborSet || neighborSet.size <= maxM) return;

    const scored = [];
    for (const nId of neighborSet) {
      const n = this.nodes.get(nId);
      if (n) {
        scored.push({ id: nId, dist: this.distance(node.vector, n.vector) });
      }
    }
    scored.sort((a, b) => a.dist - b.dist);

    const kept = new Set(scored.slice(0, maxM).map(s => s.id));
    node.neighbors.set(level, kept);
  }

  /**
   * Performs K-Nearest Neighbors (KNN) search
   * @param {Array<number>|Float32Array} queryVector
   * @param {number} [k=10]
   * @param {object} [options]
   * @param {number} [options.efSearch]
   * @param {Set<string>} [options.filter] - Set of allowed doc IDs
   * @returns {Array<{ docId: string, distance: number, score: number }>}
   */
  search(queryVector, k = 10, options = {}) {
    if (this.nodes.size === 0 || this.entryPointId === null) return [];

    const vec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
    const ef = options.efSearch || Math.max(this.efSearch, k);
    const filter = options.filter || null;

    let currObj = this.nodes.get(this.entryPointId);
    let currDist = this.distance(vec, currObj.vector);

    // 1. Traverse greedy down to layer 1
    for (let level = this.maxLevel; level >= 1; level--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighbors = currObj.neighbors.get(level) || new Set();
        for (const nId of neighbors) {
          const neighbor = this.nodes.get(nId);
          if (!neighbor) continue;
          const dist = this.distance(vec, neighbor.vector);
          if (dist < currDist) {
            currDist = dist;
            currObj = neighbor;
            changed = true;
          }
        }
      }
    }

    // 2. Search layer 0 with efSearch
    const layer0Results = this._searchLayer(vec, [currObj], ef, 0);

    const filteredResults = [];
    for (const r of layer0Results) {
      if (!filter || filter.has(r.id)) {
        // Compute normalized similarity score (1 = exact match, 0 = far)
        let score = 0;
        if (this.metric === 'cosine') {
          score = Math.max(0, 1 - r.dist);
        } else {
          score = 1 / (1 + r.dist);
        }
        filteredResults.push({
          docId: r.id,
          distance: r.dist,
          score
        });
      }
    }

    return filteredResults.slice(0, k);
  }

  /**
   * Returns total count of indexed vectors
   */
  size() {
    return this.nodes.size;
  }
}
