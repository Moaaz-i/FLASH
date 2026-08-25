/**
 * FLASH Query Plan Optimizer & Diagnostics (FlashExplain)
 */
export class FlashExplain {
  static analyze(
    collectionName,
    query,
    options,
    results,
    durationMs,
    execution = {},
  ) {
    const stage = execution.stage || (execution.indexName ? "INDEX_SCAN" : "COLLSCAN");
    return {
      queryPlanner: {
        plannerVersion: 2,
        namespace: `${collectionName}`,
        parsedQuery: query,
        winningPlan: {
          stage,
          indexName: execution.indexName || null,
          fields: execution.fields || [],
          covered: !!execution.covered,
          direction: "forward",
        },
        rejectedPlans: [],
      },
      executionStats: {
        executionSuccess: true,
        nReturned: results.length,
        executionTimeMillis: Number(durationMs.toFixed(3)),
        totalKeysExamined: execution.keysExamined ?? results.length,
        totalDocsExamined: execution.docsExamined ?? results.length,
        executionStages: {
          stage,
          indexName: execution.indexName || null,
          nReturned: results.length,
          executionTimeMillisEstimate: Number(durationMs.toFixed(3)),
          keysExamined: execution.keysExamined ?? 0,
          docsExamined: execution.docsExamined ?? results.length,
        },
      },
      serverInfo: {
        engine: "FLASH Zero-Knowledge DBMS",
        version: "1.3.0",
      },
    };
  }
}
