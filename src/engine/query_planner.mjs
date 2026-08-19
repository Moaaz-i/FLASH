import { FlashCostOptimizer } from "./cost_optimizer.mjs";

/**
 * Cost-based query planner with compound index + covered query detection.
 */
export class FlashQueryPlanner {
  /**
   * @param {object} queryEnvelope
   * @param {import('./secondary_index.mjs').FlashSecondaryIndexManager|null} secondaryManager
   * @param {Set<string>} blindFields
   * @param {number} cardinality
   */
  static plan(queryEnvelope, secondaryManager, blindFields, cardinality) {
    if (queryEnvelope._id) {
      return {
        plan: "POINT_LOOKUP",
        stage: "IDHACK",
        indexName: "_id_",
        fields: ["_id"],
        covered: false,
        estimatedCost: 1,
      };
    }

    if (queryEnvelope.$ids) {
      return {
        plan: "INDEX_SCAN",
        stage: "SECONDARY_INDEX",
        indexName: "$ids",
        fields: ["_id"],
        covered: false,
        estimatedCost: queryEnvelope.$ids.length,
      };
    }

    if (secondaryManager && queryEnvelope.$secondary) {
      const compound = secondaryManager.findBestIndexForQuery(
        queryEnvelope.$secondary,
      );
      if (compound) {
        return {
          plan: "INDEX_SCAN",
          stage: "COMPOUND_INDEX",
          indexName: compound.indexName,
          fields: compound.fields,
          covered: compound.covered,
          estimatedCost: Math.max(1, Math.log2(cardinality + 1)),
        };
      }
    }

    if (queryEnvelope.$exact) {
      const field = Object.keys(queryEnvelope.$exact)[0];
      return {
        plan: "INDEX_SCAN",
        stage: "BLIND_EXACT",
        indexName: `blind_${field}`,
        fields: [field],
        covered: false,
        estimatedCost: Math.max(1, Math.log2(cardinality + 1)),
      };
    }

    if (queryEnvelope.$range) {
      const field = Object.keys(queryEnvelope.$range)[0];
      return {
        plan: "ORE_RANGE_SCAN",
        stage: "BLIND_RANGE",
        indexName: `blind_range_${field}`,
        fields: [field],
        covered: false,
        estimatedCost: cardinality * 0.2,
      };
    }

    const blindPlan = FlashCostOptimizer.planQuery(
      {},
      blindFields,
      cardinality,
    );
    return {
      plan: blindPlan.plan,
      stage: "COLLSCAN",
      indexName: null,
      fields: [],
      covered: false,
      estimatedCost: cardinality,
    };
  }
}
