// ===== Monthly Report — "Дод 1 до ТЗ" format =====
import { $, fmt } from '../utils.js';
import { summaryIndicators, summaryFilterState, summaryBlockComments } from './state-summary.js';
import { saveBlockComment } from './db-summary.js';
import { openMonthlyIndicatorModal } from './infographic-modal.js';
import { initCellAnnotations } from './cell-annotations.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
            'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function fN(v) {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (Math.abs(v) >= 1000) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

// Normalize vol/price text to slash format: "360,6(2318,7)" → "360,6/2318,7"
function toSlash(t) { return t ? t.replace(/\(/, '/').replace(/\)$/, '') : t; }

// Check if value_text is vol/price format
function isVolPriceText(t) { return t && /[\/(]/.test(t) && /\d/.test(t); }

// Extract price from vol/price text: "31/5730" → 5730, "31(5730)" → 5730
function extractPrice(t) {
    if (!t) return null;
    const m = t.match(/[\/(]([\d\s,.]+)\)?$/);
    if (!m) return null;
    return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
}

// Темп росту: cur / prev × 100 (скільки % від попереднього)
function deltaBadge(cur, prev) {
    if (cur == null || prev == null) return '';
    if (typeof cur === 'string' || typeof prev === 'string') return '';
    if (prev === 0 || Math.abs(prev) < 0.01) {
        if (cur === 0) return '';
        return `<span class="pivot-badge-orange">—</span>`;
    }
    const pct = Math.round((cur / prev) * 1000) / 10;
    if (pct === 100) return '';
    if (pct > 9999 || pct < 0) return `<span class="pivot-badge-orange">—</span>`;
    return pct > 100
        ? `<span class="pivot-badge-up">${pct}%</span>`
        : `<span class="pivot-badge-down">${pct}%</span>`;
}

function deltaCls(cur, prev) {
    if (cur == null || prev == null || typeof cur === 'string' || typeof prev === 'string') return '';
    if (prev === 0 || Math.abs(prev) < 0.01) return cur !== 0 ? 'cell-orange' : '';
    const pct = (cur / prev) * 100;
    if (pct > 9999 || pct < 0) return 'cell-orange';
    return pct > 100 ? 'cell-up' : pct < 100 ? 'cell-down' : '';
}

// ===== Table definitions (exact names from "Дод 1 до ТЗ") =====

const TABLE_1_ROWS = [
    'Коефіцієнт фінансової стійкості (станом на кінець кварталу)',
    'Фонд оплати праці, млн. грн',
    'Середньооблікова чисельність штатних працівників',
    'Середня заробітна плата штатного працівника, грн',
    'Дебіторська заборгованість, млн. грн',
    'Кредиторська заборгованість,  млн. грн',
    'Залишок коштів на рахунках, млн. грн',
    'Недоїмка перед бюджетом, млн. грн',
    'Недоїмка перед ПФ, млн. грн',
    // FIX #5: removed duplicate 'Недоїмка перед бюджетом млн. грн'
    'Загальна реалізація, млн. грн',
    'в т.ч: лісоматеріали в круглому вигляді, млн. грн',
    'продукція переробки,  млн. грн',
    'інша реалізація (послуги, побічне користування тощо), млн грн',
    'Обсяг переробки, всього, тис. м3',
    // FIX #4: sub-indicators for processing
    'В т.ч: хвойні',
    'дуб',
    'інші',
    'Реалізація лісоматеріалів круглих, тис. м3',
    'Середня ціна реалізації 1 м3 лісоматеріалів круглих, грн/м3',
    // FIX #4: volume/price sub-indicators
    'В.т.ч: вільха, береза тис. м3/сер. ціна грн',
    'сосна тис. м3/сер. ціна грн',
    'дуб тис. м3/сер. ціна грн',
    'інші тис. м3/сер. ціна грн',
    "Реалізація деревини дров'яної ПВ  тис. м3",
    'Середня ціна реалізації 1 м3 деревини дровяної ПВ, грн/м3',
    "Реалізація деревини дров'яної НП  тис. м3",
    'Середня ціна реалізації 1 м3 деревини дровяної НП, грн/м3',
    'Реалізовано на експорт, млн. грн',
    // FIX #4: export sub-indicators
    'У т.ч.: продукція переробки (деревина) м3/сер. ціна грн',
    'продукція переробки (тріска) м3/сер. ціна грн',
    'Реалізовано на 1 штатного, грн',
    'Заготівля деревини, всього  тис. м3',
    'Рубки головного користування',
    'Рубки формування і оздоровлення лісів',
    'Ціна знеособленого 1 м3 реалізованої деревини, грн.',
    'Лісовідновлення (га)',
    'Лісорозведення (га)',
    'Сприяння природному поновленню (га)',
    'Вирощування садивного матеріалу із закритою кореневою системою, млн шт.'
];

// Snapshot indicators (past years only): use average instead of sum
const SNAPSHOT_INDICATORS = new Set([
    'середньооблікова чисельність', 'середня заробітна плата',
    'середня цін реалізації', 'середня ціна реалізації',
    'ціна знеособленого', 'реалізовано на 1 штатного',
    'коефіцієнт фінансової стійкості',
    'дебіторська заборгованість', 'кредиторська заборгованість',
    'залишок коштів на рахунках', 'недоїмка перед бюджетом', 'недоїмка перед пф',
]);
function isSnapshot(name) {
    const lower = name.toLowerCase();
    return [...SNAPSHOT_INDICATORS].some(s => lower.includes(s));
}

// FIX #4: Sub-indicators (indented with →) — normalized matching
const SUB_INDICATORS = new Set([
    'в т.ч: лісоматеріали в круглому вигляді, млн. грн',
    'продукція переробки,  млн. грн',
    'інша реалізація (послуги, побічне користування тощо), млн грн',
    'В т.ч: хвойні', 'дуб', 'інші',
    'В.т.ч: вільха, береза тис. м3/сер. ціна грн',
    'сосна тис. м3/сер. ціна грн',
    'дуб тис. м3/сер. ціна грн',
    'інші тис. м3/сер. ціна грн',
    'У т.ч.: продукція переробки (деревина) м3/сер. ціна грн',
    'продукція переробки (тріска) м3/сер. ціна грн',
    'Рубки головного користування',
    'Рубки формування і оздоровлення лісів'
]);

// FIX #6: Bold indicators (group headers / totals)
const BOLD_ROWS = new Set([
    'Загальна реалізація, млн. грн',
    'Обсяг переробки, всього, тис. м3',
    'Реалізація лісоматеріалів круглих, тис. м3',
    'Заготівля деревини, всього  тис. м3',
    'Сплачено податків та зборів всього млн. грн.',
]);

// Weighted average: price indicator → volume indicator name mapping
// YTD price = Σ(volume_i × price_i) / Σ(volume_i)
const WEIGHTED_PRICE_MAP = [
    { price: '1 м3 лісоматеріалів', volume: 'реалізація лісоматеріалів круглих' },
    { price: '1 м3 деревини дровяної пв', volume: "реалізація деревини дров'яної пв" },
    { price: '1 м3 деревини дровяної нп', volume: "реалізація деревини дров'яної нп" },
    // Salary weighted by headcount: Σ(чисельність × з/п) / Σ(чисельність)
    { price: 'середня заробітна плата штатного працівника', volume: 'середньооблікова чисельність' },
];
// Composite weighted: ціна знеособленого = (vol1*price1 + vol2*price2 + vol3*price3) / (vol1+vol2+vol3)
const COMPOSITE_PRICE = {
    price: 'ціна знеособленого',
    pairs: [
        { price: '1 м3 лісоматеріалів', volume: 'реалізація лісоматеріалів круглих' },
        { price: '1 м3 деревини дровяної пв', volume: "реалізація деревини дров'яної пв" },
        { price: '1 м3 деревини дровяної нп', volume: "реалізація деревини дров'яної нп" },
    ]
};
// Derived: реалізовано на 1 штатного = реалізація * 1000000 / чисельність
const DERIVED_PER_EMPLOYEE = {
    indicator: 'реалізовано на 1 штатного',
    revenue: 'загальна реалізація',
    headcount: 'середньооблікова чисельність'
};

function getWeightedYtd(name, allData, year, month) {
    const lower = name.toLowerCase().replace(/\s+/g, ' ').trim();

    // Simple weighted: price × volume / volume
    for (const wp of WEIGHTED_PRICE_MAP) {
        if (lower.includes(wp.price)) {
            const priceRows = matchIndicator(name, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
            const volRows = matchIndicator(wp.volume, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
            let num = 0, den = 0;
            for (const vr of volRows) {
                const pr = priceRows.find(r => r.month === vr.month);
                if (pr?.value_numeric != null) { num += vr.value_numeric * pr.value_numeric; den += vr.value_numeric; }
            }
            return den > 0 ? num / den : null;
        }
    }

    // Composite weighted: ціна знеособленого
    if (lower.includes(COMPOSITE_PRICE.price)) {
        let totalNum = 0, totalDen = 0;
        for (const pair of COMPOSITE_PRICE.pairs) {
            const priceRows = matchIndicator(pair.price, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
            const volRows = matchIndicator(pair.volume, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
            for (const vr of volRows) {
                const pr = priceRows.find(r => r.month === vr.month);
                if (pr?.value_numeric != null) { totalNum += vr.value_numeric * pr.value_numeric; totalDen += vr.value_numeric; }
            }
        }
        return totalDen > 0 ? totalNum / totalDen : null;
    }

    // Derived per-employee
    if (lower.includes(DERIVED_PER_EMPLOYEE.indicator)) {
        const revRows = matchIndicator(DERIVED_PER_EMPLOYEE.revenue, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
        const hcRows = matchIndicator(DERIVED_PER_EMPLOYEE.headcount, allData).filter(r => r.year === year && r.month > 0 && r.month <= month && r.value_numeric != null);
        const totalRev = revRows.reduce((s, r) => s + r.value_numeric, 0);
        const avgHc = hcRows.length ? hcRows.reduce((s, r) => s + r.value_numeric, 0) / hcRows.length : 0;
        return avgHc > 0 ? totalRev * 1000000 / avgHc : null;
    }

    return null; // not a weighted indicator
}

const TABLE_2_ROWS = [
    'Сплачено податків та зборів всього млн. грн.',
    'єдиний соціальний внесок  млн. грн',
    'рентна плата за спеціальне використання лісових ресурсів млн. грн',
    'податок на додану вартість  млн. грн',
    'податок на прибуток  млн. грн',
    'ПДФО',
    'ВЗ',
    'податок на лісові землі   млн. грн',
    'дивіденди  млн. грн',
    'інші   млн. грн',
    'Недоїмка перед бюджетом  млн. грн',
    'Недоїмка перед ПФ  млн. грн',
    'Дебіторська заборгованість млн. грн',
    'Кредиторська заборгованість млн. грн',
    'Залишок коштів на рахунках  млн. грн'
];

const TABLE_2_SUB = new Set([
    'єдиний соціальний внесок  млн. грн',
    'рентна плата за спеціальне використання лісових ресурсів млн. грн',
    'податок на додану вартість  млн. грн',
    'податок на прибуток  млн. грн',
    'ПДФО', 'ВЗ',
    'податок на лісові землі   млн. грн',
    'дивіденди  млн. грн',
    'інші   млн. грн'
]);

// Animal names detected dynamically from indicator_group='animals' in DB

// ===== Rendering =====

export function renderMonthlyReport(container, year, month) {
    if (!container) return;
    if (!month) month = getLatestMonth(year);
    if (!month) {
        // Fallback: find latest month across all years
        const allMonths = summaryIndicators
            .filter(r => r.month > 0 && r.value_numeric != null && (!r.sub_type || r.sub_type === 'value'))
            .sort((a, b) => b.year - a.year || b.month - a.month);
        month = allMonths.length ? allMonths[0].month : 1;
    }
    console.log(`renderMonthlyReport: year=${year}, month=${month}`);

    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5);
    // FIX #2: include ALL sub_types, not just 'value'
    const allData = summaryIndicators;

    // Month selector
    let monthSelectHtml = `<select id="monthlyMonthSelect" class="filter-select" style="width:auto;min-width:100px">
        ${MO.map((m, i) => `<option value="${i + 1}"${i + 1 === month ? ' selected' : ''}>${m}</option>`).join('')}
    </select>`;

    let html = `<div class="monthly-report-header">
        <h3 style="margin:0;font-size:15px;color:var(--text1)">Основні показники діяльності ДП «Ліси України»</h3>
        <div style="display:flex;gap:8px;align-items:center">${monthSelectHtml}</div>
    </div>`;

    // Table 1: Main indicators
    html += renderTable('Основні показники', TABLE_1_ROWS, SUB_INDICATORS, showYears, year, month, allData, 'monthly_t1');

    // Table 1b: Animal limits
    html += renderAnimalTable(showYears, year, allData);

    // Table 2: Taxes
    html += renderTable('Податки та збори', TABLE_2_ROWS, TABLE_2_SUB, showYears, year, month, allData, 'monthly_t2');

    // Table 3: Salaries by branch
    html += renderSalaryTable(showYears, year, month, allData);

    // Reference info
    html += renderReferenceBlock(allData, year, month);

    container.innerHTML = html;

    // Wire events
    wireMonthSelect(container, year);
    wireCollapse(container);
    wireRowClicks(container);
    wireCommentSaves(container, year, month);
    const reportDate = `${year}-${String(month).padStart(2, '0')}-01`;
    initCellAnnotations(container, 'monthly', reportDate, { year, month });
}

function getLatestMonth(year) {
    // Find the latest month that has actual numeric data for the selected year
    // Use only sub_type='value' to avoid false positives from volume/price records
    const months = summaryIndicators
        .filter(r => r.year === year && r.month > 0 && r.value_numeric != null
            && (!r.sub_type || r.sub_type === 'value'))
        .map(r => r.month);
    return months.length ? Math.max(...months) : null;
}

// FIX #4: normalized matching for sub-indicators
function isSub(name, subSet) {
    const n = name.replace(/\s+/g, ' ').trim().toLowerCase();
    return [...subSet].some(s => s.replace(/\s+/g, ' ').trim().toLowerCase() === n);
}

// Match indicator: collect ALL records with matching name, deduplicate by (year,month)
function matchIndicator(name, allData) {
    const lower = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const isVolPriceName = /м3.*цін|цін.*грн|сер\.\s*цін/.test(lower);
    const exact = [];
    const fuzzy = [];

    for (const r of allData) {
        const rk = r.indicator_name.toLowerCase().replace(/\s+/g, ' ').trim();
        const rkIsVolPrice = /м3.*цін|цін.*грн|сер\.\s*цін/.test(rk);

        // Don't mix vol/price indicators with regular ones
        if (isVolPriceName !== rkIsVolPrice) continue;

        if (rk === lower) {
            exact.push(r);
        } else if (lower.length <= 10) {
            // Short names: also match "ПДФО" → "пдфо  млн. грн" (yearly sheet has units in name)
            if (rk.startsWith(lower + ' ') || rk.startsWith(lower + '\u00A0')) {
                fuzzy.push(r);
            }
        } else {
            if (rk.includes(lower) || (lower.includes(rk) && rk.length > 10)) {
                fuzzy.push(r);
            }
        }
    }

    // Deduplicate: if exact match exists for a (year,month), skip fuzzy for same (year,month)
    const exactKeys = new Set(exact.map(r => `${r.year}|${r.month}`));
    const result = [...exact];
    for (const r of fuzzy) {
        if (!exactKeys.has(`${r.year}|${r.month}`)) result.push(r);
    }
    return result;
}

function renderTable(title, rowNames, subSet, showYears, year, month, allData, commentId) {
    const comments = summaryBlockComments.filter(c => c.report_type === 'monthly' && c.block_id === commentId);
    const existingComment = comments[0];

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_${commentId}">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">${title}</span>
        </div>
        <div class="monthly-table-body" id="mt_${commentId}">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr>
                <th>Показники</th>
                ${showYears.map(y => `<th>${y} рік</th>`).join('')}
                <th>${MO[month - 1]} ${year}</th>
                <th>%Δ до попер.місяця</th>
            </tr></thead>
            <tbody>`;

    for (const name of rowNames) {
        const sub = isSub(name, subSet);
        const bold = BOLD_ROWS.has(name); // FIX #6
        let displayName = sub ? `<span class="indent-sub">→ ${name}</span>` : name;
        if (bold) displayName = `<b>${displayName}</b>`;

        const rows = matchIndicator(name, allData);
        const snapshot = isSnapshot(name);

        let cells = `<td class="ind-name">${displayName}</td>`;
        for (const y of showYears) {
            if (y > year) { cells += '<td>—</td>'; continue; }

            if (y === year) {
                const ann = rows.find(r => r.year === y && r.month === 0);
                if (ann?.value_text === '-' || ann?.value_text === '*' || ann?.value_text === 'Х') {
                    cells += `<td><b>${ann.value_text}</b></td>`;
                } else if (ann && isVolPriceText(ann.value_text)) {
                    cells += `<td><b>${toSlash(ann.value_text)}</b></td>`;
                } else if (ann?.value_numeric != null && snapshot) {
                    // Snapshot/weighted: use Excel's annual value (already computed correctly)
                    cells += `<td><b>${fN(ann.value_numeric)}</b></td>`;
                } else {
                    const monthlyRecords = rows.filter(r => r.year === y && r.month > 0 && r.month <= month && r.value_numeric != null);
                    if (monthlyRecords.length) {
                        const firstVP = monthlyRecords.find(r => isVolPriceText(r.value_text));
                        if (firstVP) {
                            const totalVol = monthlyRecords.reduce((s, r) => s + r.value_numeric, 0);
                            let num = 0, den = 0;
                            for (const r of monthlyRecords) {
                                const p = extractPrice(r.value_text);
                                if (p != null && r.value_numeric) { num += r.value_numeric * p; den += r.value_numeric; }
                            }
                            const avgPrice = den > 0 ? Math.round(num / den) : null;
                            cells += `<td><b>${fN(totalVol)}${avgPrice != null ? '/' + fN(avgPrice) : ''}</b></td>`;
                        } else {
                            const weightedYtd = getWeightedYtd(name, allData, y, month);
                            const total = monthlyRecords.reduce((s, r) => s + r.value_numeric, 0);
                            const ytd = weightedYtd != null ? weightedYtd : (snapshot ? total / monthlyRecords.length : total);
                            cells += `<td><b>${fN(ytd)}</b></td>`;
                        }
                    } else {
                        cells += `<td><b>${ann?.value_text ? toSlash(ann.value_text) : '—'}</b></td>`;
                    }
                }
            } else {
                // Past years
                const ann = rows.find(r => r.year === y && r.month === 0);
                if (ann?.value_text === '-' || ann?.value_text === '*' || ann?.value_text === 'Х') {
                    cells += `<td>${ann.value_text}</td>`;
                } else if (ann?.value_text && /[\/(]/.test(ann.value_text)) {
                    cells += `<td>${toSlash(ann.value_text)}</td>`;
                } else if (ann?.value_numeric != null) {
                    cells += `<td>${fN(ann.value_numeric)}</td>`;
                } else {
                    const monthlyRecords = rows.filter(r => r.year === y && r.month > 0 && r.value_numeric != null);
                    if (monthlyRecords.length) {
                        const weightedYtd = getWeightedYtd(name, allData, y, 12);
                        const val = weightedYtd != null ? weightedYtd : (snapshot
                            ? monthlyRecords.reduce((s, r) => s + r.value_numeric, 0) / monthlyRecords.length
                            : monthlyRecords.reduce((s, r) => s + r.value_numeric, 0));
                        cells += `<td>${fN(val)}</td>`;
                    } else {
                        cells += `<td>—</td>`;
                    }
                }
            }
        }

        // FIX #3: delta — for January, compare with December of previous year
        const monthRec = rows.find(r => r.year === year && r.month === month);
        const prevMonthRec = month > 1
            ? rows.find(r => r.year === year && r.month === month - 1)
            : rows.find(r => r.year === year - 1 && r.month === 12);
        const curVal = monthRec?.value_numeric;
        const prevVal = prevMonthRec?.value_numeric;

        // Show value_text for volume/price format (as slash), else numeric
        const monthDisplay = (monthRec?.value_text && /[\/(]/.test(monthRec.value_text))
            ? toSlash(monthRec.value_text)
            : (curVal != null ? fN(curVal) : (monthRec?.value_text || '—'));
        cells += `<td><b>${monthDisplay}</b></td>`;
        cells += `<td class="${deltaCls(curVal, prevVal)}">${deltaBadge(curVal, prevVal) || '—'}</td>`;

        cells = cells.replace(/^<td>/, `<td><span class="cell-text">`);
        cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${name.replace(/"/g, '&quot;')}"></span></td>`);
        html += `<tr class="clickable-row" data-indicator="${name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
    }

    html += `</tbody></table></div>`;

    // FIX #9: comment full width
    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment monthly-comment-block">
        <textarea class="ws-comment-input monthly-comment" data-block="${commentId}" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="${commentId}">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

// Animal limits table
function renderAnimalTable(showYears, year, allData) {
    const animalData = allData.filter(r => r.indicator_group === 'animals');
    if (!animalData.length) return '';

    const animalNames = [...new Set(animalData.map(r => r.indicator_name))];
    const visibleYears = showYears.filter(y => y <= year);

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_animals">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">Чисельність / кількість лімітів тварин</span>
        </div>
        <div class="monthly-table-body" id="mt_animals">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr><th>Вид</th>${visibleYears.map(y => `<th>${y} рік</th>`).join('')}</tr></thead>
            <tbody>`;

    for (const name of animalNames) {
        const rows = animalData.filter(r => r.indicator_name === name);
        let cells = `<td class="ind-name"><span class="cell-text">${name}</span><span class="cell-anno-dot" data-indicator="${name.replace(/"/g, '&quot;')}"></span></td>`;
        for (const y of visibleYears) {
            const rec = rows.find(r => r.year === y);
            cells += `<td>${rec?.value_text || (rec?.value_numeric != null ? fN(rec.value_numeric) : '—')}</td>`;
        }
        html += `<tr class="clickable-row" data-indicator="${name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
    }

    html += `</tbody></table></div>`;

    const comments = summaryBlockComments.filter(c => c.report_type === 'monthly' && c.block_id === 'monthly_animals');
    const existingComment = comments[0];
    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment monthly-comment-block">
        <textarea class="ws-comment-input monthly-comment" data-block="monthly_animals" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="monthly_animals">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

function renderSalaryTable(showYears, year, month, allData) {
    const EXCLUDE_SALARY = ['середня з/п по філіях', 'середня з/п по лісових', 'середня заробітна плата штатного'];
    const salaryRows = allData.filter(r => {
        const lower = r.indicator_name.toLowerCase();
        if (EXCLUDE_SALARY.some(ex => lower.includes(ex))) return false;
        if (lower.startsWith('*')) return false; // footnotes: *, **, ***
        if (lower.startsWith('довідково')) return false;
        if (lower.includes('прожитковий') || lower.includes('мінімальна заробітна') || lower.includes('середня заробітна плата в країні')) return false;
        return r.indicator_group === 'salary_by_branch' ||
            lower.includes('філія') || lower.includes('лісовий офіс') ||
            lower.includes('навчальний центр') || lower.includes('репродуктивні') ||
            lower.includes('пожежний') || lower.includes('карпатський') ||
            lower.includes('південний') || lower.includes('північний') ||
            lower.includes('подільський') || lower.includes('поліський') ||
            lower.includes('слобожанський') || lower.includes('столичний') ||
            lower.includes('східний') || lower.includes('центральний');
    });

    // Show branches in original Excel order (no alphabetical sort)
    const seen = new Set();
    let branchNames = salaryRows
        .filter(r => r.year === year && r.value_numeric != null)
        .map(r => r.indicator_name)
        .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
    if (!branchNames.length) {
        seen.clear();
        branchNames = salaryRows.map(r => r.indicator_name)
            .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
    }
    if (!branchNames.length) return '';

    const comments = summaryBlockComments.filter(c => c.report_type === 'monthly' && c.block_id === 'monthly_t3');
    const existingComment = comments[0];

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_monthly_t3">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">Середня з/п по філіях одного штатного працівника, грн</span>
        </div>
        <div class="monthly-table-body" id="mt_monthly_t3">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr>
                <th>Філія</th>
                ${showYears.map(y => `<th>${y} рік</th>`).join('')}
                <th>${MO[month - 1]} ${year}</th>
                <th>%Δ до попер.місяця</th>
                <th>Сер. з/п в регіоні</th>
            </tr></thead>
            <tbody>`;

    for (const name of branchNames) {
        const rows = salaryRows.filter(r => r.indicator_name === name);
        let cells = `<td class="ind-name">${name}</td>`;
        for (const y of showYears) {
            if (y > year) { cells += '<td>—</td>'; continue; } // FIX #1
            const ann = rows.find(r => r.year === y && r.month === 0);
            if (ann?.value_numeric != null) {
                const isCurrent = y === year;
                cells += `<td${isCurrent ? '><b' : ''}>${fN(ann.value_numeric)}${isCurrent ? '</b>' : ''}</td>`;
            } else if (y === year) {
                const monthlyRecs = rows.filter(r => r.year === y && r.month > 0 && r.month <= month && r.value_numeric != null);
                if (monthlyRecs.length) {
                    const avg = monthlyRecs.reduce((s, r) => s + r.value_numeric, 0) / monthlyRecs.length;
                    cells += `<td><b>${fN(avg)}</b></td>`;
                } else {
                    cells += `<td>—</td>`;
                }
            } else {
                cells += `<td>—</td>`;
            }
        }
        const cur = rows.find(r => r.year === year && r.month === month);
        // FIX #3: January → December prev year
        const prev = month > 1
            ? rows.find(r => r.year === year && r.month === month - 1)
            : rows.find(r => r.year === year - 1 && r.month === 12);
        const curVal = cur?.value_numeric;
        const prevVal = prev?.value_numeric;
        cells += `<td><b>${curVal != null ? fN(curVal) : '—'}</b></td>`;
        cells += `<td class="${deltaCls(curVal, prevVal)}">${deltaBadge(curVal, prevVal) || '—'}</td>`;
        // Region salary column
        const regionRec = allData.find(r => r.indicator_group === 'region_salary' && r.indicator_name === name);
        cells += `<td>${regionRec?.value_numeric != null ? fN(regionRec.value_numeric) : '—'}</td>`;
        cells = cells.replace(/^<td>/, `<td><span class="cell-text">`);
        cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${name.replace(/"/g, '&quot;')}"></span></td>`);
        html += `<tr class="clickable-row" data-indicator="${name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
    }

    html += `</tbody></table></div>`;

    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment monthly-comment-block">
        <textarea class="ws-comment-input monthly-comment" data-block="monthly_t3" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="monthly_t3">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

function renderReferenceBlock(allData, year, month) {
    // Try to get reference text for selected month, fallback to latest available
    let refRecord = allData.find(r => r.indicator_group === 'reference' && r.year === year && r.month === month);
    if (!refRecord) {
        // Fallback: latest reference record
        refRecord = allData.filter(r => r.indicator_group === 'reference')
            .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    }
    const refText = refRecord?.value_text || '';

    let content = '';
    if (refText) {
        // Format reference text from Excel — group by section headers
        const lines = refText.split('\n').filter(l => l.trim());
        let currentSection = '';
        for (const line of lines) {
            const t = line.trim();
            if (/^[А-ЯЄЇҐA-Z]{3,}.*:$/.test(t) || /^ПММ:|^ГАЗ:|^ЕЛЕКТРОЕНЕРГІЯ:|^ПРОДУКТИ/i.test(t)) {
                currentSection = t;
                content += `<div class="ref-section"><div class="ref-title">${t}</div>`;
            } else if (/^прожитковий|^мінімальна|^середня заробітна/i.test(t)) {
                content += `<div class="ref-section"><p>${t}</p></div>`;
            } else if (t.startsWith('-') || t.startsWith('–')) {
                const hasUp = /⬆|\([\+]/.test(t);
                const hasDown = /⬇|\(\-/.test(t);
                const cls = hasUp ? 'ref-delta-up' : hasDown ? 'ref-delta-down' : '';
                content += `<p class="${cls}">${t}</p>`;
            } else {
                content += `<p>${t}</p>`;
            }
        }
    } else {
        content = '<p style="color:var(--text3);font-size:12px">Довідкові дані відсутні. Завантажте Excel файл.</p>';
    }

    return `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_monthly_ref">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">Довідково</span>
        </div>
        <div class="monthly-table-body" id="mt_monthly_ref">
            <div class="monthly-ref-content">${content}</div>
        </div>
    </div>`;
}

// ===== Event wiring =====

function wireMonthSelect(container, year) {
    const sel = container.querySelector('#monthlyMonthSelect');
    if (!sel) return;
    sel.onchange = () => {
        const m = parseInt(sel.value);
        renderMonthlyReport(container, year, m);
    };
}

function wireCollapse(container) {
    container.querySelectorAll('.monthly-table-header[data-collapse-target]').forEach(hdr => {
        hdr.style.cursor = 'pointer';
        hdr.onclick = () => {
            const targetId = hdr.dataset.collapseTarget;
            const body = container.querySelector(`#${targetId}`);
            const chevron = hdr.querySelector('.ws-block-chevron');
            if (!body) return;
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            if (chevron) chevron.textContent = hidden ? '▼' : '▶';
        };
    });
}

function wireRowClicks(container) {
    container.querySelectorAll('.clickable-row').forEach(row => {
        row.onclick = () => openMonthlyIndicatorModal(row.dataset.indicator, '');
    });
}

function wireCommentSaves(container, year, month) {
    container.querySelectorAll('.ws-comment-save').forEach(btn => {
        btn.onclick = async () => {
            const blockId = btn.dataset.block;
            const textarea = container.querySelector(`textarea[data-block="${blockId}"]`);
            if (!textarea) return;
            const content = textarea.value.trim();
            if (!content) return;
            btn.disabled = true;
            btn.textContent = 'Збереження...';
            try {
                const reportDate = `${year}-${String(month).padStart(2, '0')}-01`;
                await saveBlockComment({ reportType: 'monthly', reportDate, blockId, content });
                btn.textContent = 'Збережено ✓';
                setTimeout(() => { btn.textContent = 'Зберегти'; btn.disabled = false; }, 1500);
            } catch (e) {
                btn.textContent = 'Помилка';
                setTimeout(() => { btn.textContent = 'Зберегти'; btn.disabled = false; }, 2000);
            }
        };
    });
}
