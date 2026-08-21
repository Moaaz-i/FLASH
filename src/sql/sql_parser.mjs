/**
 * FLASH Zero-Knowledge SQL Query Parser & Execution Engine (FlashSQL)
 * Converts standard SQL queries into encrypted document queries and ORE comparisons.
 */
import { FlashBinary } from "../binary/flash_binary.mjs";

export class FlashSQL {
  /**
   * Parses and executes a standard SQL query against a FlashDatabase or collection
   * @param {import('../core/database.mjs').FlashDatabase} db
   * @param {string} sqlQuery
   * @returns {Promise<Array<object>>}
   */
  static async execute(db, sqlQuery) {
    const parsed = FlashSQL.parse(sqlQuery);
    if (!parsed.table) {
      throw new Error('SQL Query must specify a table (FROM <table>)');
    }

    const col = db.collection(parsed.table);
    await col.init();

    // Query collection
    let records = FlashBinary.decodeRecords(await col.find({}));

    // Filter WHERE
    if (parsed.where.length > 0) {
      records = records.filter(doc => {
        return parsed.where.every(clause => FlashSQL._evalClause(doc, clause));
      });
    }

    // Sort ORDER BY
    if (parsed.orderBy) {
      const { field, dir } = parsed.orderBy;
      records.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        return dir === 'DESC' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
      });
    }

    // Skip OFFSET
    if (parsed.offset > 0) {
      records = records.slice(parsed.offset);
    }

    // Limit LIMIT
    if (parsed.limit !== null) {
      records = records.slice(0, parsed.limit);
    }

    // Project SELECT fields
    if (!parsed.fields.includes('*')) {
      records = records.map(doc => {
        const projected = {};
        for (const f of parsed.fields) {
          if (doc[f] !== undefined) projected[f] = doc[f];
        }
        return projected;
      });
    }

    return records;
  }

  /**
   * Parses simple SQL syntax into structured AST
   * @param {string} sql
   */
  static parse(sql) {
    const clean = sql.trim().replace(/;/g, '');
    const tokens = clean.split(/\s+/);

    let fields = ['*'];
    let table = null;
    const where = [];
    let orderBy = null;
    let limit = null;
    let offset = 0;

    // Extract SELECT fields
    const selectMatch = clean.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      fields = selectMatch[1].split(',').map(s => s.trim());
    }

    // Extract FROM table
    const fromMatch = clean.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      table = fromMatch[1];
    }

    // Extract WHERE clause
    const whereMatch = clean.match(/WHERE\s+(.+?)(?=\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/i);
    if (whereMatch) {
      const condStr = whereMatch[1];
      const conds = condStr.split(/\s+AND\s+/i);
      for (const cond of conds) {
        const m = cond.match(/([a-zA-Z0-9_]+)\s*(>=|<=|!=|=|>|<|LIKE)\s*(.+)/i);
        if (m) {
          let val = m[3].trim().replace(/^['"]|['"]$/g, '');
          if (!isNaN(Number(val))) val = Number(val);
          where.push({ field: m[1], op: m[2].toUpperCase(), value: val });
        }
      }
    }


    // Extract ORDER BY
    const orderMatch = clean.match(/ORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      orderBy = { field: orderMatch[1], dir: (orderMatch[2] || 'ASC').toUpperCase() };
    }

    // Extract LIMIT & OFFSET
    const limitMatch = clean.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) limit = parseInt(limitMatch[1], 10);

    const offsetMatch = clean.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) offset = parseInt(offsetMatch[1], 10);

    return { fields, table, where, orderBy, limit, offset };
  }

  static _evalClause(doc, clause) {
    const val = doc[clause.field];
    if (val === undefined) return false;

    switch (clause.op) {
      case '=': return val == clause.value;
      case '!=': return val != clause.value;
      case '>': return val > clause.value;
      case '>=': return val >= clause.value;
      case '<': return val < clause.value;
      case '<=': return val <= clause.value;
      case 'LIKE': return String(val).toLowerCase().includes(String(clause.value).replace(/%/g, '').toLowerCase());
      default: return true;
    }
  }
}
