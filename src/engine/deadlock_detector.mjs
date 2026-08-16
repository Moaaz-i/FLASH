/**
 * FLASH Transaction Deadlock Detector (FlashDeadlockDetector)
 * Implements Directed Wait-For Graph (WFG) analysis and Tarjan's/DFS cycle detection
 * to preemptively resolve concurrent transaction deadlocks.
 */
export class FlashDeadlockDetector {
  constructor() {
    // txId -> Set<txId> (txA waits for txB)
    this.waitForGraph = new Map();
  }

  /**
   * Adds a wait-for dependency: txWaiting is blocked waiting for txHolding
   * @param {string} txWaiting
   * @param {string} txHolding
   * @returns {boolean} True if a deadlock cycle was created
   */
  addDependency(txWaiting, txHolding) {
    if (txWaiting === txHolding) return false;

    if (!this.waitForGraph.has(txWaiting)) {
      this.waitForGraph.set(txWaiting, new Set());
    }
    this.waitForGraph.get(txWaiting).add(txHolding);

    const cycle = this.detectCycle();
    return cycle.length > 0;
  }

  /**
   * Removes all dependencies when a transaction completes or aborts
   * @param {string} txId
   */
  removeTransaction(txId) {
    this.waitForGraph.delete(txId);
    for (const waitingSet of this.waitForGraph.values()) {
      waitingSet.delete(txId);
    }
  }

  /**
   * Detects cycles in the wait-for graph using DFS
   * @returns {string[]} Array of transaction IDs in the deadlock cycle, or empty array
   */
  detectCycle() {
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (node, path) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.waitForGraph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor, [...path]);
          if (cycle.length > 0) return cycle;
        } else if (recursionStack.has(neighbor)) {
          return path.slice(path.indexOf(neighbor));
        }
      }

      recursionStack.delete(node);
      return [];
    };

    for (const node of this.waitForGraph.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node, []);
        if (cycle.length > 0) return cycle;
      }
    }

    return [];
  }
}
