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
        // Annual snapshot (Excel cross-year cell) is bookkeeping-authoritative
        // та не страждає від floating-point drift'у sum-of-monthly. Перевага
        // annual ТІЛЬКИ при complete view (slider охоплює всі доступні monthly
        // дані) — для partial view sum зберігає month-slider semantics.
        //
        // Cases:
        //   1. monthly=0 (e.g. 2022 yearly file без monthly breakdown) → annual
        //   2. closed year cellMonth=12, rows == allRows → annual (no drift)
        //   3. current year, slider на latest uploaded month (rows==allRows)
        //      → annual (= Excel YTD-as-of-latest)
        //   4. current year, slider на ранній місяць (rows < allRows)
        //      → sum-of-monthly (preserves "slide back" semantics)
        const rows = findMonthlyRecords(code, allData, year, month);
        const ann = findAnnualRecord(code, allData, year);
        const annualValue = ann?.value_numeric ?? null;

        // Case 1: no monthly data at all
        if (rows.length === 0) return annualValue;

        // Determine complete vs partial view via second lookup без slider:
        const allRows = findMonthlyRecords(code, allData, year, 12);
        const isCompleteView = rows.length === allRows.length;

        // Cases 2-3: complete view + annual exists → annual (bookkeeping-correct)
        if (isCompleteView && annualValue != null) return annualValue;

        // Case 4: partial view (slider scrolled back) → sum-of-monthly
        return rows.reduce((s, r) => s + r.value_numeric, 0);
    }

    if (f === 'avg') {
        const rows = findMonthlyRecords(code, allData, year, month);
        if (rows.length) return rows.reduce((s, r) => s + r.value_numeric, 0) / rows.length;
        const ann = findAnnualRecord(code, allData, year);
        return ann?.value_numeric ?? null;
    }

    if (f === 'last') {
        // Per Тетянине рішення: NO carry-forward для balance-type metrics
        // (receivables/payables/cash/arrears — всі 10 indicators з
        // ytd_formula='last' є balance-type у M_FIN + M_TAX). Якщо поточний
        // період має лише value_text marker ('до DD.MM.YYYY') без numeric —
        // показати annual snapshot або '—', НЕ карі-forward останнього
        // ненульового місяця.
        const cur = findMonthRecord(code, allData, year, month);
        if (cur?.value_numeric != null) return cur.value_numeric;
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

function computeDerived(indicator, allData, year, month, singleMonth = false) {
    const f = indicator.derived_formula;

    // YTD complete-view annual preference (analog Patch 1 для sum metrics):
    // closes per_employee 2023-2025 divergence з Excel (Excel weighted formula
    // vs local simple avg). Preserves slider semantics — для partial view
    // falls through до local YTD computation. Skip для singleMonth — то
    // викликається з current-month cell (Patch 3), там потрібен per-formula
    // обчислений single-month value, не annual snapshot.
    if (!singleMonth) {
        const ann = findAnnualRecord(indicator.code, allData, year);
        if (ann?.value_numeric != null) {
            const rows = findMonthlyRecords(indicator.code, allData, year, month);
            const allRows = findMonthlyRecords(indicator.code, allData, year, 12);
            if (rows.length === 0 || rows.length === allRows.length) {
                return ann.value_numeric;
            }
        }
    }

    let computed = null;

    if (f === 'per_employee') {
        if (singleMonth) {
            // Single-month: revenue × 1M / headcount of that specific month.
            const revRec = findMonthRecord('revenue_total_mln', allData, year, month);
            const hcRec  = findMonthRecord('headcount', allData, year, month);
            if (revRec?.value_numeric != null && hcRec?.value_numeric > 0) {
                computed = revRec.value_numeric * 1_000_000 / hcRec.value_numeric;
            }
        } else {
            // YTD: sum(revenue_total_mln × 1M) / avg(headcount) over [1..month]
            const rev = findMonthlyRecords('revenue_total_mln', allData, year, month);
            const hc  = findMonthlyRecords('headcount', allData, year, month);
            const totalRev = rev.reduce((s, r) => s + r.value_numeric, 0);
            const avgHc = hc.length ? hc.reduce((s, r) => s + r.value_numeric, 0) / hc.length : 0;
            if (avgHc > 0) computed = totalRev * 1_000_000 / avgHc;
        }
    }
    else if (f === 'avg_wood_price') {
        const pairs = [
            ['sale_roundwood_km3',   'sale_roundwood_price_grn'],
            ['sale_pv_firewood_km3', 'sale_pv_firewood_price_grn'],
            ['sale_np_firewood_km3', 'sale_np_firewood_price_grn'],
        ];
        let num = 0, den = 0;
        if (singleMonth) {
            // Single-month: Σ(vol_i × price_i) / Σ(vol_i) for that month only.
            for (const [volCode, priceCode] of pairs) {
                const vr = findMonthRecord(volCode, allData, year, month);
                const pr = findMonthRecord(priceCode, allData, year, month);
                if (pr?.value_numeric != null && vr?.value_numeric != null) {
                    num += vr.value_numeric * pr.value_numeric;
                    den += vr.value_numeric;
                }
            }
        } else {
            // YTD: weighted avg across all months [1..month].
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
        }
        if (den > 0) computed = num / den;
    }
    else if (f === 'sales_other_residual') {
        if (singleMonth) {
            // Single-month: residual = total[m] - roundwood[m] - processing[m]
            const tot = findMonthRecord('revenue_total_mln',      allData, year, month);
            const rnd = findMonthRecord('revenue_roundwood_mln',  allData, year, month);
            const prc = findMonthRecord('revenue_processing_mln', allData, year, month);
            if (tot?.value_numeric != null) {
                computed = tot.value_numeric - (rnd?.value_numeric || 0) - (prc?.value_numeric || 0);
            }
        } else {
            // YTD: residual = total_YTD - round_YTD - processing_YTD
            // (computeYtd 'sum' branch returns annual snapshot for closed years).
            const totYtd = computeYtd(getIndicatorByCode('revenue_total_mln'),      allData, year, month);
            const rndYtd = computeYtd(getIndicatorByCode('revenue_roundwood_mln'),  allData, year, month);
            const prcYtd = computeYtd(getIndicatorByCode('revenue_processing_mln'), allData, year, month);
            if (totYtd != null) {
                computed = totYtd - (rndYtd || 0) - (prcYtd || 0);
            }
        }
    }

    if (computed != null) return computed;

    // Annual fallback: when monthly inputs are insufficient to compute (e.g.
    // partial view, OR top-level annual-first didn't trigger because monthly
    // count differs from expected), look up the derived metric's own annual
    // snapshot (period_month=0). Defensive — for закритого view annual вже
    // спрацював вище; цей блок ловить edge cases.
    const ann = findAnnualRecord(indicator.code, allData, year);
    return ann?.value_numeric ?? null;
}
