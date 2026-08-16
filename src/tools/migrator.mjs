/**
 * FLASH Schema Migration Engine (FlashMigrator)
 * Versioned, reversible up/down migrations with execution state tracking.
 */
export class FlashMigrator {
  /**
   * @param {import('../core/database.mjs').FlashDatabase} db
   */
  constructor(db) {
    this.db = db;
    // Array of { version: number, name: string, up: Function, down: Function }
    this.migrations = [];
    this.executedVersions = new Set();
  }

  /**
   * Registers a migration definition
   * @param {number} version
   * @param {string} name
   * @param {Function} up - async (db) => void
   * @param {Function} down - async (db) => void
   */
  register(version, name, up, down) {
    this.migrations.push({ version, name, up, down });
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Executes all pending 'up' migrations
   * @returns {Promise<Array<{ version: number, name: string, status: string }>>}
   */
  async up() {
    const executed = [];
    for (const m of this.migrations) {
      if (!this.executedVersions.has(m.version)) {
        await m.up(this.db);
        this.executedVersions.add(m.version);
        executed.push({ version: m.version, name: m.name, status: 'APPLIED' });
      }
    }
    return executed;
  }

  /**
   * Rolls back the last applied migration
   */
  async rollback() {
    const appliedList = Array.from(this.executedVersions).sort((a, b) => b - a);
    if (appliedList.length === 0) return null;

    const lastVersion = appliedList[0];
    const migration = this.migrations.find(m => m.version === lastVersion);

    if (migration && migration.down) {
      await migration.down(this.db);
      this.executedVersions.delete(lastVersion);
      return { version: migration.version, name: migration.name, status: 'REVERTED' };
    }

    return null;
  }
}
