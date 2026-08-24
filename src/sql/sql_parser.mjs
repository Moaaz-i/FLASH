/**
 * FLASH Zero-Knowledge SQL Query Parser & Execution Engine (FlashSQL)
 * Parses SQL on the client, converts predicates to blind-index queries,
 * and decrypts only inside FlashClient.
 */
import { FlashZKKernel } from "../crypto/zk_kernel.mjs";

export class FlashSQL {
  /**
   * Parses and executes a standard SQL query against a FlashClient collection.
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {string} sqlQuery
   * @returns {Promise<Array<object>>}
   */
  static async execute(client, sqlQuery) {
    FlashZKKernel.requireClient(client, "FlashSQL.execute");
    const parsed = FlashSQL.parse(sqlQuery);
    if (!parsed.table) {
      throw new Error("SQL Query must specify a table (FROM <table>)");
    }

    const col = client.collection(parsed.table);
    const query = FlashSQL._whereToQuery(parsed.where);
    let records = await col.find(query);

    if (parsed.orderBy) {
      const { field, dir } = parsed.orderBy;
      records = [...records].sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        return dir === "DESC" ? (valB > valA ? 1 : -1) : valA > valB ? 1 : -1;
      });
    }

    if (parsed.offset > 0) {
      records = records.slice(parsed.offset);
    }

    if (parsed.limit !== null) {
      records = records.slice(0, parsed.limit);
    }

    if (!parsed.fields.includes("*")) {
      records = records.map((doc) => {
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
    const clean = sql.trim().replace(/;/g, "");
    let fields = ["*"];
    let table = null;
    const where = [];
    let orderBy = null;
    let limit = null;
    let offset = 0;

    const selectMatch = clean.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      fields = selectMatch[1].split(",").map((s) => s.trim());
    }

    const fromMatch = clean.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      table = fromMatch[1];
    }

    const whereMatch = clean.match(
      /WHERE\s+(.+?)(?=\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/i,
    );
    if (whereMatch) {
      const condStr = whereMatch[1];
      const conds = condStr.split(/\s+AND\s+/i);
      for (const cond of conds) {
        const m = cond.match(/([a-zA-Z0-9_]+)\s*(>=|<=|!=|=|>|<|LIKE)\s*(.+)/i);
        if (m) {
          let val = m[3].trim().replace(/^['"]|['"]$/g, "");
          if (!isNaN(Number(val))) val = Number(val);
          where.push({ field: m[1], op: m[2].toUpperCase(), value: val });
        }
      }
    }

    const orderMatch = clean.match(
      /ORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?/i,
    );
    if (orderMatch) {
      orderBy = {
        field: orderMatch[1],
        dir: (orderMatch[2] || "ASC").toUpperCase(),
      };
    }

    const limitMatch = clean.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) limit = parseInt(limitMatch[1], 10);

    const offsetMatch = clean.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) offset = parseInt(offsetMatch[1], 10);

    return { fields, table, where, orderBy, limit, offset };
  }

  static _whereToQuery(where = []) {
    const query = {};
    for (const clause of where) {
      switch (clause.op) {
        case "=":
          query[clause.field] = clause.value;
          break;
        case "!=":
          query[clause.field] = { $ne: clause.value };
          break;
        case ">":
          query[clause.field] = { $gt: clause.value };
          break;
        case ">=":
          query[clause.field] = { $gte: clause.value };
          break;
        case "<":
          query[clause.field] = { $lt: clause.value };
          break;
        case "<=":
          query[clause.field] = { $lte: clause.value };
          break;
        case "LIKE":
          query[clause.field] = {
            $regex: String(clause.value).replace(/%/g, ""),
          };
          break;
        default:
          break;
      }
    }
    return query;
  }
}
