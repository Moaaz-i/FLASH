/**
 * FLASH Graph Database Engine (FlashGraph)
 * Native graph storage supporting Nodes, Directed Weighted Edges, and BFS/Dijkstra shortest path traversal.
 */
export class FlashGraph {
  constructor() {
    // nodeId -> { id: string, label: string, properties: object }
    this.nodes = new Map();
    // fromNodeId -> Map<toNodeId, { label: string, weight: number, properties: object }>
    this.adjacency = new Map();
  }

  /**
   * Adds or updates a node
   * @param {string} id
   * @param {string} label
   * @param {object} [properties]
   */
  addNode(id, label, properties = {}) {
    const nodeId = String(id);
    this.nodes.set(nodeId, { id: nodeId, label, properties });
    if (!this.adjacency.has(nodeId)) {
      this.adjacency.set(nodeId, new Map());
    }
    return this.nodes.get(nodeId);
  }

  /**
   * Adds a directed edge between two nodes
   * @param {string} fromId
   * @param {string} toId
   * @param {string} label - Relationship name (e.g. 'FOLLOWS', 'FRIENDS_WITH')
   * @param {number} [weight=1.0]
   * @param {object} [properties]
   */
  addEdge(fromId, toId, label, weight = 1.0, properties = {}) {
    const from = String(fromId);
    const to = String(toId);

    if (!this.nodes.has(from)) this.addNode(from, 'Node');
    if (!this.nodes.has(to)) this.addNode(to, 'Node');

    this.adjacency.get(from).set(to, { label, weight, properties });
  }

  /**
   * Returns all outgoing neighbors of a node
   * @param {string} nodeId
   * @param {string} [edgeLabel]
   */
  getNeighbors(nodeId, edgeLabel = null) {
    const neighborsMap = this.adjacency.get(String(nodeId));
    if (!neighborsMap) return [];

    const result = [];
    for (const [toId, edge] of neighborsMap.entries()) {
      if (!edgeLabel || edge.label === edgeLabel) {
        result.push({
          node: this.nodes.get(toId),
          edge
        });
      }
    }
    return result;
  }

  /**
   * Finds shortest path between two nodes using Dijkstra algorithm
   * @param {string} startId
   * @param {string} endId
   * @returns {{ path: string[], distance: number }|null}
   */
  findShortestPath(startId, endId) {
    const start = String(startId);
    const end = String(endId);

    const distances = new Map();
    const previous = new Map();
    const unvisited = new Set(this.nodes.keys());

    for (const n of this.nodes.keys()) {
      distances.set(n, Infinity);
    }
    distances.set(start, 0);

    while (unvisited.size > 0) {
      let current = null;
      let minDistance = Infinity;

      for (const n of unvisited) {
        const d = distances.get(n);
        if (d < minDistance) {
          minDistance = d;
          current = n;
        }
      }

      if (current === null || minDistance === Infinity) break;
      if (current === end) {
        // Construct path
        const path = [];
        let curr = end;
        while (curr) {
          path.unshift(curr);
          curr = previous.get(curr);
        }
        return { path, distance: distances.get(end) };
      }

      unvisited.delete(current);

      const neighbors = this.adjacency.get(current) || new Map();
      for (const [neighborId, edge] of neighbors.entries()) {
        if (unvisited.has(neighborId)) {
          const alt = distances.get(current) + edge.weight;
          if (alt < distances.get(neighborId)) {
            distances.set(neighborId, alt);
            previous.set(neighborId, current);
          }
        }
      }
    }

    return null;
  }
}
