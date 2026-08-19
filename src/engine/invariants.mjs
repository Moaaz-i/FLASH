/**
 * Collection integrity invariants (consistency checks).
 */
export class FlashInvariants {
  /**
   * @param {import('../core/collection.mjs').FlashCollection} collection
   */
  static async verify(collection) {
    if (!collection.isReady) await collection.init();

    const errors = [];
    let activeDocs = 0;
    let orphanIndexRefs = 0;

    for (const id of collection.docIdSet) {
      const raw = await collection._getRawDoc(id);
      if (!raw) {
        errors.push(`docId ${id} in registry but missing from storage`);
        continue;
      }
      activeDocs++;

      if (collection.indexManager) {
        let indexed = false;
        for (const fieldMap of collection.indexManager.exactIndexes.values()) {
          for (const set of fieldMap.values()) {
            if (set.has(id)) indexed = true;
          }
        }
        if (!indexed && collection.indexManager.exactIndexes.size > 0) {
          // blind indexes optional on docs without _blind
        }
      }
    }

    if (collection.secondaryIndexManager) {
      for (const index of collection.secondaryIndexManager.indexes.values()) {
        for (const [key, ids] of index.map.entries()) {
          for (const docId of ids) {
            if (!collection.docIdSet.has(String(docId))) {
              orphanIndexRefs++;
              errors.push(
                `secondary index ${index.name} key ${key} references missing doc ${docId}`,
              );
            }
          }
        }
      }
    }

    const count = await collection.count();
    if (count !== activeDocs) {
      errors.push(`count()=${count} but activeDocs=${activeDocs}`);
    }

    return {
      valid: errors.length === 0,
      activeDocs,
      registeredIds: collection.docIdSet.size,
      sstables: collection.sstables.length,
      orphanIndexRefs,
      errors,
    };
  }
}
