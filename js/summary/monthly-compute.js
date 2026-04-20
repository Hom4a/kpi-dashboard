// ===== Monthly Compute — shared logic for render, exports, infographics =====
import { getById, normalizeLookup } from './indicators-config.js';

// ===== Formatting =====

export function fN(v) {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

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

// ===== Record lookup =====

/**
 * Match indicator name: exact first, then startsWith for short names.
 * Handles DB variants like "ПДФО  млн. грн" matching config "ПДФО".
 */
// Processing sub-types: short generic names used in multiple blocks.
// Must match EXACTLY to avoid cross-block match with tax "інші млн. грн" etc.
const SUBITEM_EXACT_ONLY = new Set(['інші', 'дуб', 'хвойні']);

export function nameMatches(configName, dbName) {
    const cn = normalizeLookup(configName);
    const dn = normalizeLookup(dbName);
    if (cn === dn) return true;
    // Sub-items (processing sub-types) — exact match only to prevent
    // cross-block collision with "інші млн. грн" (tax) etc.
    if (SUBITEM_EXACT_ONLY.has(cn)) return false;
    // Don't match short generic names with vol/price indicators from another block
    // e.g. "дуб" should NOT match "дуб тис. м3/сер. ціна грн"
    if (dn.includes('м3/сер') || dn.includes('тис. м3/')) {
        // Only match if config name also looks like vol/price
        if (!cn.includes('м3/сер') && !cn.includes('тис. м3/')) return false;
    }
    // Short config names (<=10 chars): match DB name with unit suffix
    // e.g. "ПДФО" → "ПДФО  млн. грн", "ВЗ" → "ВЗ  млн. грн"
    if (cn.length <= 10 && dn.startsWith(cn + ' ')) return true;
    // Longer names with extra suffixes
    if (cn.length > 10 && (dn.startsWith(cn + ' ') || dn.startsWith(cn + ','))) return true;
    return false;
}

/**
 * Find DB records matching an indicator config by name.
 * Returns records for given year, months 1..month.
 * Deduplicates by month (keeps first match).
 */
export function findMonthlyRecords(indicatorName, allData, year, month) {
    const seen = new Set();
    return allData.filter(r => {
        if (r.year !== year || r.month <= 0 || r.month > month || r.value_numeric == null) return false;
        if (!nameMatches(indicatorName, r.indicator_name)) return false;
        if (seen.has(r.month)) return false;
        seen.add(r.month);
        return true;
    });
}

/**
 * Find annual record (month=0) for a given year.
 */
export function findAnnualRecord(indicatorName, allData, year) {
    // Use findLast to get latest record when duplicates exist (newer upload wins)
    return allData.findLast(r =>
        r.year === year && r.month === 0 &&
        nameMatches(indicatorName, r.indicator_name)
    );
}

/**
 * Find monthly record for specific month.
 */
export function findMonthRecord(indicatorName, allData, year, month) {
    return allData.findLast(r =>
        r.year === year && r.month === month &&
        nameMatches(indicatorName, r.indicator_name)
    );
}

// ===== YTD Computation =====

/**
 * Compute YTD value for an indicator config.
 * Returns { value: number|string|null, display: string }
 */
export function computeYtd(config, allData, year, month) {
    const { ytd, name } = config;

    // Check annual record first for special text markers
    const ann = findAnnualRecord(name, allData, year);
    if (ann?.value_text === '-' || ann?.value_text === '*' || ann?.value_text === 'Х') {
        return { value: null, display: ann.value_text };
    }

    if (ytd === 'text') {
        // Text-only indicators (коефіцієнт, садивний матеріал)
        if (ann?.value_text) return { value: null, display: ann.value_text };
        const monthRec = findMonthRecord(name, allData, year, month);
        return { value: null, display: monthRec?.value_text || '—' };
    }

    if (ytd === 'last') {
        // Snapshot: show "—" for YTD (these are point-in-time values)
        return { value: null, display: '—' };
    }

    const records = findMonthlyRecords(name, allData, year, month);
    if (!records.length) {
        // No monthly data — check annual
        if (ann && isVolPriceText(ann.value_text)) return { value: ann.value_numeric, display: toSlash(ann.value_text) };
        if (ann?.value_numeric != null) return { value: ann.value_numeric, display: fN(ann.value_numeric) };
        if (ann?.value_text) return { value: null, display: ann.value_text };
        return { value: null, display: '—' };
    }

    if (ytd === 'sum') {
        const total = records.reduce((s, r) => s + r.value_numeric, 0);
        return { value: total, display: fN(total) };
    }

    if (ytd === 'avg') {
        const total = records.reduce((s, r) => s + r.value_numeric, 0);
        const avg = total / records.length;
        return { value: avg, display: fN(avg) };
    }

    if (ytd === 'weighted') {
        const weightConfig = getById(config.weightBy);
        if (!weightConfig) return { value: null, display: '—' };
        const weightRecords = findMonthlyRecords(weightConfig.name, allData, year, month);
        let num = 0, den = 0;
        for (const wr of weightRecords) {
            const vr = records.find(r => r.month === wr.month);
            if (vr?.value_numeric != null && wr.value_numeric) {
                num += wr.value_numeric * vr.value_numeric;
                den += wr.value_numeric;
            }
        }
        if (den > 0) {
            const weighted = num / den;
            return { value: weighted, display: fN(weighted) };
        }
        // Fallback to simple average
        const avg = records.reduce((s, r) => s + r.value_numeric, 0) / records.length;
        return { value: avg, display: fN(avg) };
    }

    if (ytd === 'volprice') {
        const totalVol = records.reduce((s, r) => s + r.value_numeric, 0);
        let pNum = 0, pDen = 0;
        for (const r of records) {
            const p = extractPrice(r.value_text);
            if (p != null && r.value_numeric) {
                pNum += r.value_numeric * p;
                pDen += r.value_numeric;
            }
        }
        const avgPrice = pDen > 0 ? Math.round(pNum / pDen) : null;
        const display = `${fN(totalVol)}${avgPrice != null ? '/' + fN(avgPrice) : ''}`;
        return { value: totalVol, display };
    }

    if (ytd === 'derived') {
        const val = computeDerived(config.derivedFormula, allData, year, month);
        return { value: val, display: val != null ? fN(val) : '—' };
    }

    return { value: null, display: '—' };
}

// ===== Derived formulas =====

function computeDerived(formulaId, allData, year, month) {
    if (formulaId === 'per_employee') {
        const revConfig = getById('total_sales');
        const hcConfig = getById('headcount');
        if (!revConfig || !hcConfig) return null;
        const revRecords = findMonthlyRecords(revConfig.name, allData, year, month);
        const hcRecords = findMonthlyRecords(hcConfig.name, allData, year, month);
        if (!revRecords.length || !hcRecords.length) return null;
        const totalRev = revRecords.reduce((s, r) => s + r.value_numeric, 0);
        const avgHc = hcRecords.reduce((s, r) => s + r.value_numeric, 0) / hcRecords.length;
        return avgHc > 0 ? totalRev * 1000000 / avgHc : null;
    }

    if (formulaId === 'avg_wood_price') {
        const pairs = [
            ['vol_round', 'price_round'],
            ['vol_firewood_pv', 'price_firewood_pv'],
            ['vol_firewood_np', 'price_firewood_np'],
        ];
        let totalNum = 0, totalDen = 0;
        for (const [volId, priceId] of pairs) {
            const volConfig = getById(volId);
            const priceConfig = getById(priceId);
            if (!volConfig || !priceConfig) continue;
            const volRecs = findMonthlyRecords(volConfig.name, allData, year, month);
            const priceRecs = findMonthlyRecords(priceConfig.name, allData, year, month);
            for (const vr of volRecs) {
                const pr = priceRecs.find(r => r.month === vr.month);
                if (pr?.value_numeric != null && vr.value_numeric) {
                    totalNum += vr.value_numeric * pr.value_numeric;
                    totalDen += vr.value_numeric;
                }
            }
        }
        return totalDen > 0 ? totalNum / totalDen : null;
    }

    return null;
}

// ===== Past year value =====

export function getPastYearValue(config, allData, year) {
    const ann = findAnnualRecord(config.name, allData, year);
    if (ann) {
        if (ann.value_text === '-' || ann.value_text === '*' || ann.value_text === 'Х') {
            return { value: null, display: ann.value_text };
        }
        if (isVolPriceText(ann.value_text)) {
            return { value: ann.value_numeric, display: toSlash(ann.value_text) };
        }
        if (ann.value_numeric != null) {
            return { value: ann.value_numeric, display: fN(ann.value_numeric) };
        }
        if (ann.value_text) return { value: null, display: ann.value_text };
    }
    // Fallback: compute from monthly records (if no annual record)
    const monthly = allData.filter(r =>
        r.year === year && r.month > 0 && r.value_numeric != null &&
        nameMatches(config.name, r.indicator_name)
    );
    if (monthly.length) {
        return computeYtd(config, allData, year, 12);
    }
    return { value: null, display: '—' };
}

// ===== Delta badge =====

export function deltaBadge(cur, prev) {
    if (cur == null || prev == null) return { html: '', cls: '' };
    if (typeof cur === 'string' || typeof prev === 'string') return { html: '', cls: '' };
    if (prev === 0 || Math.abs(prev) < 0.01) {
        if (cur === 0) return { html: '', cls: '' };
        return { html: '<span class="pivot-badge-orange">—</span>', cls: 'cell-orange' };
    }
    const pct = Math.round((cur / prev) * 1000) / 10;
    if (pct === 100) return { html: '', cls: '' };
    if (pct > 9999 || pct < 0) return { html: '<span class="pivot-badge-orange">—</span>', cls: 'cell-orange' };
    const html = pct > 100
        ? `<span class="pivot-badge-up">${pct}%</span>`
        : `<span class="pivot-badge-down">${pct}%</span>`;
    const cls = pct > 100 ? 'cell-up' : 'cell-down';
    return { html, cls };
}
