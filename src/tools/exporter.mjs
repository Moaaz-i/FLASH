import fs from 'node:fs';
import readline from 'node:readline';
import { FlashBinary } from '../binary/flash_binary.mjs';

/**
 * FLASH ETL & Bulk Data Exporter/Importer (FlashETL)
 * High-speed export & import supporting NDJSON (Newline Delimited JSON) and CSV.
 */

export class FlashETL {
  /**
   * Exports an entire collection to an NDJSON file
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @param {string} destFilePath
   * @returns {Promise<{ exportedCount: number, filePath: string }>}
   */
  static async exportToNDJSON(collection, destFilePath) {
    await collection.init();
    const docs = FlashBinary.decodeRecords(await collection.find({}));
    const writeStream = fs.createWriteStream(destFilePath, { encoding: 'utf8' });

    let count = 0;
    for (const doc of docs) {
      writeStream.write(JSON.stringify(doc) + '\n');
      count++;
    }

    await new Promise(resolve => writeStream.end(resolve));
    return { exportedCount: count, filePath: destFilePath };
  }

  /**
   * Imports documents from an NDJSON file into a collection in streaming batches
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @param {string} sourceFilePath
   * @param {number} [batchSize=500]
   * @returns {Promise<{ importedCount: number }>}
   */
  static async importFromNDJSON(collection, sourceFilePath, batchSize = 500) {
    await collection.init();
    const fileStream = fs.createReadStream(sourceFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let batch = [];
    let importedCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);
        batch.push(doc);

        if (batch.length >= batchSize) {
          await collection.insertMany(batch);
          importedCount += batch.length;
          batch = [];
        }
      } catch (err) {
        console.error('[FlashETL] Line parse error:', err.message);
      }
    }

    if (batch.length > 0) {
      await collection.insertMany(batch);
      importedCount += batch.length;
    }

    return { importedCount };
  }

  /**
   * Exports collection documents to CSV format
   * @param {import('../core/collection.mjs').FlashCollection} collection
   * @param {string} destFilePath
   * @param {string[]} [fields]
   * @returns {Promise<{ exportedCount: number }>}
   */
  static async exportToCSV(collection, destFilePath, fields = null) {
    await collection.init();
    const docs = FlashBinary.decodeRecords(await collection.find({}));
    if (docs.length === 0) {
      await fs.promises.writeFile(destFilePath, '');
      return { exportedCount: 0 };
    }

    const headers = fields || Object.keys(docs[0]);
    const lines = [headers.join(',')];

    for (const doc of docs) {
      const row = headers.map(h => {
        const val = doc[h];
        if (val === undefined || val === null) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      });
      lines.push(row.join(','));
    }

    await fs.promises.writeFile(destFilePath, lines.join('\n'), 'utf8');
    return { exportedCount: docs.length };
  }
}
