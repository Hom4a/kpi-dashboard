// ===== Monthly Report — DB-driven (indicator_code matching) =====
// Render тягне список показників з indicators-loader (preloaded з БД) і
// матчить значення в summaryIndicators через r.indicator_code. Без fuzzy
// name matching — одна чиста реалізація.
import { summaryIndicators, summaryBlockComments } from './state-summary.js';
import { saveBlockComment } from './db-summary.js';
import { openMonthlyIndicatorModal } from './infographic-modal.js';
import { initCellAnnotations } from './cell-annotations.js';
import {
    getIndicatorsByBlocks, getIndicatorByCode,
    getAllBranches, getAllSpecies,
    getTaxBlockIndicators,
    MONTHLY_TABLE_1_BLOCKS, MONTHLY_TABLE_2_BLOCKS,
} from './indicators-loader.js';
import {
    fN, toSlash, isVolPriceText, extractPrice,
    findMonthRecord, findMonthlyRecords,
    computeYtd, computeVolpriceYtd,
} from './monthly-compute.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
            'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

// Темп росту: cur / prev × 100
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

// ===== Main renderer =====

export function renderMonthlyReport(container, year, month) {
    if (!container) return;
    if (!month) month = getLatestMonth(year);
    if (!month) {
        const allMonths = summaryIndicators
            .filter(r => r.month > 0 && r.value_numeric != null)
            .sort((a, b) => b.year - a.year || b.month - a.month);
        month = allMonths.length ? allMonths[0].month : 1;
    }

    const allYears = [...new Set(summaryIndicators.map(r => r.year).filter(y => y != null))].sort();
    const showYears = allYears.slice(-5);
    const allData = summaryIndicators;

    const monthSelectHtml = `<select id="monthlyMonthSelect" class="filter-select" style="width:auto;min-width:100px">
        ${MO.map((m, i) => `<option value="${i + 1}"${i + 1 === month ? ' selected' : ''}>${m}</option>`).join('')}
    </select>`;

    let html = `<div class="monthly-report-header">
        <h3 style="margin:0;font-size:15px;color:var(--text1)">Основні показники діяльності ДП «Ліси України»</h3>
        <div style="display:flex;gap:8px;align-items:center">${monthSelectHtml}</div>
    </div>`;

    // Table 1: Main indicators (M_FIN + M_REV + M_PROD + M_FOR)
    const table1 = getIndicatorsByBlocks(MONTHLY_TABLE_1_BLOCKS);
    html += renderIndicatorTable('Основні показники', table1, showYears, year, month, allData, 'monthly_t1');

    // Animals
    html += renderAnimalTable(showYears, year, allData);

    // Table 2: Taxes (M_TAX) + crossrendered M_FIN finance metrics
    // (Excel rows 63-67) at the bottom — see getTaxBlockIndicators().
    const table2 = getTaxBlockIndicators();
    html += renderIndicatorTable('Податки та збори', table2, showYears, year, month, allData, 'monthly_t2');

    // Salary per branch
    html += renderSalaryTable(showYears, year, month, allData);

    // Reference block
    html += renderReferenceBlock(allData, year, month);

    container.innerHTML = html;

    wireMonthSelect(container, year);
    wireCollapse(container);
    wireRowClicks(container);
    wireCommentSaves(container, year, month);
    const reportDate = `${year}-${String(month).padStart(2, '0')}-01`;
    initCellAnnotations(container, 'monthly', reportDate, { year, month });
}

function getLatestMonth(year) {
    const months = summaryIndicators
        .filter(r => r.year === year && r.month > 0 && r.value_numeric != null && r.indicator_code)
        .map(r => r.month);
    return months.length ? Math.max(...months) : null;
}

// ===== Generic indicator table (Table 1, Table 2) =====

function renderIndicatorTable(title, indicators, showYears, year, month, allData, commentId) {
    if (!indicators.length) return '';

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

    for (const ind of indicators) {
        html += renderIndicatorRow(ind, showYears, year, month, allData);
    }

    html += `</tbody></table></div>`;

    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment monthly-comment-block">
        <textarea class="ws-comment-input monthly-comment" data-block="${commentId}" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="${commentId}">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

function renderIndicatorRow(ind, showYears, year, month, allData) {
    const displayName = ind.is_subitem
        ? `<span class="indent-sub">→ ${ind.canonical_name}</span>`
        : ind.canonical_name;
    const finalName = ind.is_header
        ? `<b>${displayName}</b>`
        : displayName;

    const isVolPrice = ind.value_kind === 'volprice';
    const isText = ind.value_kind === 'text';

    let cells = `<td class="ind-name">${finalName}</td>`;

    // Year cells
    for (const y of showYears) {
        if (y > year) { cells += '<td>—</td>'; continue; }

        const isCurrent = y === year;
        const cellMonth = isCurrent ? month : 12;

        let cellContent = '—';
        let isBold = isCurrent;

        if (isText) {
            const last = findMonthlyRecords(ind.code, allData, y, cellMonth).pop();
            cellContent = last?.value_text || '—';
        } else if (isVolPrice) {
            const { volume, avgPrice } = computeVolpriceYtd(ind, allData, y, cellMonth);
            if (volume != null) {
                cellContent = fN(volume) + (avgPrice != null ? '/' + fN(avgPrice) : '');
            }
        } else {
            const ytd = computeYtd(ind, allData, y, cellMonth);
            if (ytd != null) {
                cellContent = typeof ytd === 'string' ? ytd : fN(ytd);
            }
        }

        cells += isBold
            ? `<td><b>${cellContent}</b></td>`
            : `<td>${cellContent}</td>`;
    }

    // Current month cell + delta
    let curDisplay = '—', curNum = null;
    if (isText) {
        const monthRec = findMonthRecord(ind.code, allData, year, month);
        curDisplay = monthRec?.value_text || '—';
    } else if (isVolPrice) {
        const monthRec = findMonthRecord(ind.code, allData, year, month);
        if (monthRec?.value_text) {
            curDisplay = toSlash(monthRec.value_text);
            curNum = monthRec.value_numeric; // volume
        } else if (monthRec?.value_numeric != null) {
            curDisplay = fN(monthRec.value_numeric);
            curNum = monthRec.value_numeric;
        }
    } else if (ind.ytd_formula === 'derived') {
        // Derived: compute for just-this-month using single-month range
        const val = computeYtd(ind, allData, year, month);
        if (val != null) { curDisplay = fN(val); curNum = val; }
    } else {
        const monthRec = findMonthRecord(ind.code, allData, year, month);
        if (monthRec?.value_numeric != null) {
            curDisplay = fN(monthRec.value_numeric);
            curNum = monthRec.value_numeric;
        } else if (monthRec?.value_text) {
            curDisplay = monthRec.value_text;
        }
    }
    cells += `<td><b>${curDisplay}</b></td>`;

    // Delta vs previous month (Jan → Dec prev year)
    let prevNum = null;
    if (curNum != null && !isText) {
        const prevMonth = month > 1 ? month - 1 : 12;
        const prevYear  = month > 1 ? year : year - 1;
        const prevRec = findMonthRecord(ind.code, allData, prevYear, prevMonth);
        prevNum = prevRec?.value_numeric ?? null;
    }
    cells += `<td class="${deltaCls(curNum, prevNum)}">${deltaBadge(curNum, prevNum) || '—'}</td>`;

    // Wrap for cell annotations
    const indicatorKey = ind.code;
    cells = cells.replace(/^<td class="ind-name">/, `<td class="ind-name"><span class="cell-text">`);
    cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${indicatorKey}"></span></td>`);
    return `<tr class="clickable-row" data-indicator="${indicatorKey}" data-display="${ind.canonical_name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
}

// ===== Animals =====

function renderAnimalTable(showYears, year, allData) {
    const species = getAllSpecies();
    if (!species.length) return '';
    const animalData = allData.filter(r => r.indicator_group === 'animals');
    if (!animalData.length) return '';

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

    for (const sp of species) {
        const rows = animalData.filter(r => r.indicator_code === sp.code);
        let cells = `<td class="ind-name"><span class="cell-text">${sp.canonical_name}</span><span class="cell-anno-dot" data-indicator="${sp.code}"></span></td>`;
        for (const y of visibleYears) {
            const rec = rows.find(r => r.year === y);
            cells += `<td>${rec?.value_text || (rec?.value_numeric != null ? fN(rec.value_numeric) : '—')}</td>`;
        }
        html += `<tr class="clickable-row" data-indicator="${sp.code}" data-display="${sp.canonical_name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
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

// ===== Salary per branch =====

function renderSalaryTable(showYears, year, month, allData) {
    const branches = getAllBranches();
    if (!branches.length) return '';
    const salaryRows = allData.filter(r => r.indicator_group === 'salary_by_branch');
    if (!salaryRows.length) return '';

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

    // Ітерація по salary_branches (sort_order з БД) — 20 рядків
    for (const br of branches) {
        const rows = salaryRows.filter(r => r.indicator_code === br.code);
        // Якщо для гілки нема жодного значення в жодному з видимих років — пропускаємо
        const anyValue = rows.some(r => r.value_numeric != null && showYears.includes(r.year));
        if (!anyValue) continue;

        let cells = `<td class="ind-name">${br.canonical_name}</td>`;
        for (const y of showYears) {
            if (y > year) { cells += '<td>—</td>'; continue; }
            const monthlyRecs = rows.filter(r => r.year === y && r.month > 0 && r.month <= (y === year ? month : 12) && r.value_numeric != null);
            const isCurrent = y === year;
            let cellVal = null;
            if (monthlyRecs.length) {
                cellVal = monthlyRecs.reduce((s, r) => s + r.value_numeric, 0) / monthlyRecs.length;
            } else {
                // Annual fallback (yearly file single snapshot)
                const annual = rows.find(r => r.year === y && r.month === 0 && r.value_numeric != null);
                if (annual) cellVal = annual.value_numeric;
            }
            if (cellVal != null) {
                cells += isCurrent ? `<td><b>${fN(cellVal)}</b></td>` : `<td>${fN(cellVal)}</td>`;
            } else {
                cells += `<td>—</td>`;
            }
        }
        const cur = rows.find(r => r.year === year && r.month === month);
        const prev = month > 1
            ? rows.find(r => r.year === year && r.month === month - 1)
            : rows.find(r => r.year === year - 1 && r.month === 12);
        const curVal = cur?.value_numeric ?? null;
        const prevVal = prev?.value_numeric ?? null;
        cells += `<td><b>${curVal != null ? fN(curVal) : '—'}</b></td>`;
        cells += `<td class="${deltaCls(curVal, prevVal)}">${deltaBadge(curVal, prevVal) || '—'}</td>`;

        // Region salary column (матч по тому ж branch_code через region__<code>)
        const regionRec = allData.find(r =>
            r.indicator_group === 'region_salary' &&
            r.indicator_code === 'region__' + br.code &&
            r.year === year && r.month === month
        );
        cells += `<td>${regionRec?.value_numeric != null ? fN(regionRec.value_numeric) : '—'}</td>`;

        cells = cells.replace(/^<td class="ind-name">/, `<td class="ind-name"><span class="cell-text">`);
        cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${br.code}"></span></td>`);
        html += `<tr class="clickable-row" data-indicator="${br.code}" data-display="${br.canonical_name.replace(/"/g, '&quot;')}" style="cursor:pointer">${cells}</tr>`;
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

// ===== Reference =====

const REFERENCE_CATEGORY_ORDER = [
    'subsistence_minimum', 'min_wage', 'country_avg_salary',
    'electricity_population', 'electricity_business',
    'gas_population', 'gas_business',
    'fuel_diesel', 'fuel_a95', 'fuel_a92',
    'food_bread_rye', 'food_eggs', 'food_pork', 'food_lard',
];

/**
 * Render the «Довідково» block.
 *
 * Backend post-5.3.4 emits N rows per (year, month) — one per
 * reference category (subsistence_minimum, min_wage, fuel_diesel,
 * food_bread_rye, etc.). Legacy data (pre-5.3.4) was a single row
 * with all categories joined by '\n' in value_text.
 *
 * This function handles both: filter all matching rows, join their
 * value_text by '\n', then let the existing split-and-classify
 * regex below treat each line uniformly (top-level/header/bullet).
 *
 * Categories ordered by REFERENCE_CATEGORY_ORDER list (subsistence →
 * tariffs → fuel → food); unknown categories sink to the end stably.
 *
 * If no rows match the requested (year, month), fall back to the
 * newest available period — better than empty block.
 */
function renderReferenceBlock(allData, year, month) {
    let refRows = allData.filter(
        r => r.indicator_group === 'reference' && r.year === year && r.month === month
    );

    if (refRows.length === 0) {
        const all = allData.filter(r => r.indicator_group === 'reference');
        if (all.length > 0) {
            const newest = all.sort((a, b) => b.year - a.year || b.month - a.month)[0];
            refRows = all.filter(r => r.year === newest.year && r.month === newest.month);
        }
    }

    refRows.sort((a, b) => {
        const ai = REFERENCE_CATEGORY_ORDER.indexOf(a.indicator_name);
        const bi = REFERENCE_CATEGORY_ORDER.indexOf(b.indicator_name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const refText = refRows.map(r => r.value_text).filter(Boolean).join('\n');

    let content = '';
    if (refText) {
        const lines = refText.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const t = line.trim();
            if (/^[А-ЯЄЇҐA-Z]{3,}.*:$/.test(t) || /^ПММ:|^ГАЗ:|^ЕЛЕКТРОЕНЕРГІЯ:|^ПРОДУКТИ/i.test(t)) {
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
        row.onclick = () => {
            const code = row.dataset.indicator;
            const display = row.dataset.display || code;
            const ind = getIndicatorByCode(code);
            openMonthlyIndicatorModal(ind?.canonical_name || display, '');
        };
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
