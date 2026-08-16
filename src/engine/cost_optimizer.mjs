/**
 * FLASH Cost-Based Query Optimizer (FlashCostOptimizer)
 * Chooses the lowest-cost query execution plan (Index Scan vs ORE Range Scan vs Full Scan).
 */
export class FlashCostOptimizer {
  /**
   * Plans optimal execution path for a query filter
   * @param {object} query - Query filter
   * @param {Set<string>} availableIndexes - List of indexed field names
   * @param {number} totalDocuments - Approximate collection cardinality
   * @returns {{ plan: 'POINT_LOOKUP'|'INDEX_SCAN'|'ORE_RANGE_SCAN'|'TABLE_SCAN', field?: string, estimatedCost: number }}
   */
  static planQuery(query = {}, availableIndexes = new Set(), totalDocuments = 1000) {
    if (query._id) {
      return { plan: 'POINT_LOOKUP', field: '_id', estimatedCost: 1.0 };
    }

    // Check exact match indexes
    for (const key of Object.keys(query)) {
      if (availableIndexes.has(key)) {
        const val = query[key];
        if (typeof val !== 'object') {
          return { plan: 'INDEX_SCAN', field: key, estimatedCost: Math.max(1, Math.log2(totalDocuments)) };
        } else if (val.$gt || val.$lt || val.$gte || val.$lte) {
          return { plan: 'ORE_RANGE_SCAN', field: key, estimatedCost: totalDocuments * 0.2 };
        }
      }
    }

    return { plan: 'TABLE_SCAN', estimatedCost: totalDocuments * 1.0 };
  }
}
