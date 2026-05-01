// ===== Monthly Compute — DB-driven (code-based, no name matching) =====
// Формули беруться з `indicators` metadata (preloaded через indicators-loader.js):
//   ytd_formula: 'sum' | 'avg' | 'weighted' | 'last' | 'volprice' | 'derived' | 'text'
//   weight_by_code: код iншого indicator-а для 'weighted' і 'volprice' пар
//   derived_formula: 'per_employee' | 'avg_wood_price' | 'sales_other_residual'
import { getIndicatorByCode } from './indicators-loader.js';

// ===== Formatting =====
export function fN(v) {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

// Normalize vol/price text to slash format: "360,6(2318,7)" → "360,6/2318,7"
export function toSlash(t) {
    return t ? t.replace(/\(/, '/').replace(/\)$/, '') : t;
}

export function extractPrice(text) {
    if (!text) return null;
    const m = text.match(/[\/(]([\d\s,.]+)\)?$/);
    if (!m) return null;
    return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
}

export function isVolPriceText(t) {
    return t && /[\/(]/.test(t) && /\d/.test(t) && !/^\(без/i.test(t);
}

// ===== Record lookup (by indicator_code, NOT by name) =====

/** Знайти всі рядки з `allData` за даним кодом для (year, month). */
export function findByCode(code, allData, year, month) {
    return allData.filter(r =>
        r.indicator_code === code &&
        r.year === year && r.month === month
    );
}

/** Останній запис за місяць (month) для коду. */
export function findMonthRecord(code, allData, year, month) {
    return allData.findLast(r =>
        r.indicator_code === code && r.year === year && r.month === month
    );
}

/** Усі monthly записи (1..month) за даним кодом у заданому році. */
export function findMonthlyRecords(code, allData, year, month) {
    return allData
        .filter(r =>
            r.indicator_code === code && r.year === year &&
            r.month >= 1 && r.month <= month && r.value_numeric != null
        )
        .sort((a, b) => a.month - b.month);
}

/** Annual snapshot (month=0) — для yearly Excel (2022-2025) які не мають
 *  розбивки по місяцях. Використовується як fallback коли monthly breakdown відсутнє. */
export function findAnnualRecord(code, allData, year) {
    return allData.find(r =>
        r.indicator_code === code && r.year === year && r.month === 0
    );
}

// ===== YTD Computation =====

/**
 * Обчислити YTD значення для indicator-а за формулою з БД.
 * Повертає число або null.
 */
export function computeYtd(indicator, allData, year, month) {
    if (!indicator) return null;
    const code = indicator.code;
    const f = indicator.ytd_formula;

    if (f === 'text') {
        const last = findMonthlyRecords(code, allData, year, month).pop();
        if (last) return last.value_text ?? null;
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_text ?? null;
    }

    if (f === 'sum') {
        const rows = findMonthlyRecords(code, allData, year, month);
        if (rows.length) return rows.reduce((s, r) => s + r.value_numeric, 0);
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'avg') {
        const rows = findMonthlyRecords(code, allData, year, month);
        if (rows.length) return rows.reduce((s, r) => s + r.value_numeric, 0) / rows.length;
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'last') {
        const rows = findMonthlyRecords(code, allData, year, month);
        if (rows.length) return rows[rows.length - 1].value_numeric;
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'weighted') {
        // Σ(weight_i × value_i) / Σ(weight_i)
        const weightCode = indicator.weight_by_code;
        if (!weightCode) return null;
        const valRows = findMonthlyRecords(code, allData, year, month);
        const weightRows = findMonthlyRecords(weightCode, allData, year, month);
        let num = 0, den = 0;
        for (const vr of valRows) {
            const wr = weightRows.find(r => r.month === vr.month);
            if (wr?.value_numeric != null && vr.value_numeric != null) {
                num += wr.value_numeric * vr.value_numeric;
                den += wr.value_numeric;
            }
        }
        if (den > 0) return num / den;
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'volprice') {
        // Total volume = SUM; avg price = weighted by volume
        const rows = findMonthlyRecords(code, allData, year, month);
        if (rows.length) return rows.reduce((s, r) => s + (r.value_numeric || 0), 0);
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'derived') {
        return computeDerived(indicator, allData, year, month);
    }

    return null;
}

/** Для volprice: повертає {volume, avgPrice} за YTD period. Annual fallback. */
export function computeVolpriceYtd(indicator, allData, year, month) {
    const code = indicator.code;
    const rows = findMonthlyRecords(code, allData, year, month);
    if (rows.length) {
        let vol = 0, num = 0, den = 0;
        for (const r of rows) {
            const p = extractPrice(r.value_text);
            vol += (r.value_numeric || 0);
            if (p != null && r.value_numeric) {
                num += r.value_numeric * p;
                den += r.value_numeric;
            }
        }
        return { volume: vol, avgPrice: den > 0 ? Math.round(num / den) : null };
    }
    // Annual fallback (yearly file single snapshot)
    const ann = findAnnualRecord(code, allData, year);
    if (ann) {
        const price = extractPrice(ann.value_text);
        return { volume: ann.value_numeric, avgPrice: price };
    }
    return { volume: null, avgPrice: null };
}

// ===== Derived formulas =====

function computeDerived(indicator, allData, year, month) {
    const f = indicator.derived_formula;

    if (f === 'per_employee') {
        // total_sales × 1_000_000 / avg(headcount)
        const rev = findMonthlyRecords('total_sales', allData, year, month);
        const hc  = findMonthlyRecords('headcount', allData, year, month);
        const totalRev = rev.reduce((s, r) => s + r.value_numeric, 0);
        const avgHc = hc.length ? hc.reduce((s, r) => s + r.value_numeric, 0) / hc.length : 0;
        return avgHc > 0 ? totalRev * 1_000_000 / avgHc : null;
    }

    if (f === 'avg_wood_price') {
        // (vol_round × price_round + vol_fw_pv × price_fw_pv + vol_fw_np × price_fw_np)
        // / (vol_round + vol_fw_pv + vol_fw_np)
        const pairs = [
            ['vol_round',       'price_round'],
            ['vol_firewood_pv', 'price_firewood_pv'],
            ['vol_firewood_np', 'price_firewood_np'],
        ];
        let num = 0, den = 0;
        for (const [volCode, priceCode] of pairs) {
            const vols   = findMonthlyRecords(volCode, allData, year, month);
            const prices = findMonthlyRecords(priceCode, allData, year, month);
            for (const vr of vols) {
                const pr = prices.find(r => r.month === vr.month);
                if (pr?.value_numeric != null && vr.value_numeric != null) {
                    num += vr.value_numeric * pr.value_numeric;
                    den += vr.value_numeric;
                }
            }
        }
        return den > 0 ? num / den : null;
    }

    if (f === 'sales_other_residual') {
        // total_sales - sales_round - sales_processed (YTD)
        const total = computeYtd(getIndicatorByCode('total_sales'), allData, year, month) || 0;
        const round = computeYtd(getIndicatorByCode('sales_round'),  allData, year, month) || 0;
        const proc  = computeYtd(getIndicatorByCode('sales_processed'), allData, year, month) || 0;
        return total - round - proc;
    }

    return null;
}
