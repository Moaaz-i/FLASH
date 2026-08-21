# Graph Database Engine & Path Traversal

**FLASH DB** embeds a full-featured **Graph Database Engine** (`FlashGraph`) for social networks, fraud detection, and knowledge graph relationships.

---

## Key Features

* **Nodes & Labels**: Store property graphs with arbitrary metadata.
* **Weighted Directed Edges**: Multi-relational relationships (`FOLLOWS`, `TRANSFERRED_TO`, `AUTHORS`).
* **Shortest Path Analysis**: Integrated Dijkstra algorithm for minimum-cost path calculations.

---

## Example Usage

```javascript
import { FlashGraph } from '@moaaz-i/flash-db';

const graph = new FlashGraph();

// 1. Add Nodes
graph.addNode('alice', 'User', { name: 'Alice Smith', tier: 'Gold' });
graph.addNode('bob', 'User', { name: 'Bob Jones', tier: 'Silver' });
graph.addNode('carol', 'User', { name: 'Carol White', tier: 'Gold' });

// 2. Add Relationships
graph.addEdge('alice', 'bob', 'TRANSFERRED', 1.0, { amount: 500 });
graph.addEdge('bob', 'carol', 'TRANSFERRED', 2.0, { amount: 350 });

// 3. Find Shortest Path
const route = graph.findShortestPath('alice', 'carol');
console.log(route);
// { path: ['alice', 'bob', 'carol'], distance: 3.0 }
```
