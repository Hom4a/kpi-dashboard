// ===== Database Utility Functions =====
import { sb } from './config.js';

const PAGE_SIZE = 1000;

/**
 * Load all records from a Supabase table with automatic pagination.
 * Replaces repetitive while-loop + range() pattern across all DB modules.
 *
 * @param {string} table - Table name
 * @param {object} [opts] - Options
 * @param {string} [opts.select] - Select expression (default '*')
 * @param {Array<{col: string, ascending?: boolean}>} [opts.order] - Order clauses
 * @param {Array<{col: string, op: string, val: any}>} [opts.filters] - Filter clauses
 * @param {number} [opts.pageSize] - Rows per page (default 1000)
 * @returns {Promise<Array>}
 */
export async function paginatedLoad(table, opts = {}) {
    const { select = '*', order = [], filters = [], pageSize = PAGE_SIZE } = opts;
    const all = [];
    let from = 0;
    while (true) {
        let q = sb.from(table).select(select).range(from, from + pageSize - 1);
        for (const { col, ascending = true } of order) {
            q = q.order(col, { ascending });
        }
        for (const { col, op, val } of filters) {
            if (op === 'eq') q = q.eq(col, val);
            else if (op === 'in') q = q.in(col, val);
            else if (op === 'gte') q = q.gte(col, val);
            else if (op === 'lte') q = q.lte(col, val);
            else if (op === 'neq') q = q.neq(col, val);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}
