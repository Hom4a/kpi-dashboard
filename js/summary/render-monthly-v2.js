// ===== Monthly Report V2 — config-driven rendering =====
import { $ } from '../utils.js';
import { summaryIndicators, summaryBlockComments } from './state-summary.js';
import { saveBlockComment } from './db-summary.js';
import { openMonthlyIndicatorModal } from './infographic-modal.js';
import { initCellAnnotations } from './cell-annotations.js';
import { TABLE_1, TABLE_2, SALARY_TABLE, ANIMALS_TABLE, REFERENCE_BLOCK } from './indicators-config.js';
import { fN, toSlash, isVolPriceText, findMonthRecord,
         computeYtd, getPastYearValue, deltaBadge } from './monthly-compute.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
            'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

// ===== Main entry =====

export function renderMonthlyV2(container, year, month) {
    if (!container) return;
    const allData = summaryIndicators;
    if (!allData.length) { container.innerHTML = '<div class="ws-block-empty">Немає даних. Завантажте Excel файл.</div>'; return; }

    if (!year) year = new Date().getFullYear();
    if (!month) month = getLatestMonth(year, allData);
    if (!month) month = 1;

    const allYears = [...new Set(allData.map(r => r.year).filter(y => y > 0))].sort();
    const showYears = allYears.slice(-5);

    let html = `<div class="monthly-report-header">
        <h3 style="margin:0;font-size:15px;color:var(--text1)">Основні показники діяльності ДП «Ліси України»</h3>
        <div style="display:flex;gap:8px;align-items:center">
            <select id="monthlyMonthSelectV2" class="filter-select" style="width:auto;min-width:100px">
                ${MO.map((m, i) => `<option value="${i+1}"${i+1===month?' selected':''}>${m}</option>`).join('')}
            </select>
        </div>
    </div>`;

    // Table 1
    html += renderTableV2(TABLE_1, allData, showYears, year, month);
    // Animals
    html += renderAnimalTableV2(allData, showYears, year);
    // Table 2
    html += renderTableV2(TABLE_2, allData, showYears, year, month);
    // Salary
    html += renderSalaryTableV2(allData, showYears, year, month);
    // Reference
    html += renderReferenceV2(allData, year, month);

    container.innerHTML = html;

    // Wire month selector
    const sel = $('monthlyMonthSelectV2');
    if (sel) {
        sel.onchange = () => renderMonthlyV2(container, year, parseInt(sel.value));
    }

    // Wire row clicks → infographic
    container.querySelectorAll('.clickable-row').forEach(row => {
        row.onclick = () => {
            const ind = row.dataset.indicator;
            if (ind) openMonthlyIndicatorModal(ind, year, month);
        };
    });

    // Wire collapse
    container.querySelectorAll('[data-collapse-target]').forEach(header => {
        header.style.cursor = 'pointer';
        header.onclick = () => {
            const body = document.getElementById(header.dataset.collapseTarget);
            if (!body) return;
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            const chevron = header.querySelector('.ws-block-chevron');
            if (chevron) chevron.textContent = hidden ? '▼' : '▶';
        };
    });

    // Wire comment saves
    container.querySelectorAll('.ws-comment-save').forEach(btn => {
        btn.onclick = async () => {
            const blockId = btn.dataset.block;
            const textarea = container.querySelector(`.ws-comment-input[data-block="${blockId}"]`);
            if (!textarea) return;
            try {
                await saveBlockComment({
                    reportType: 'monthly', reportDate: `${year}-${String(month).padStart(2,'0')}-01`,
                    blockId, content: textarea.value.trim(),
                    reportYear: year, reportMonth: month
                });
                btn.textContent = '✓'; setTimeout(() => btn.textContent = 'Зберегти', 1500);
            } catch (e) { console.error('Comment save error:', e); }
        };
    });

    // Cell annotations
    const reportDate = `${year}-${String(month).padStart(2,'0')}-01`;
    initCellAnnotations(container, 'monthly', reportDate, { year, month });
}

// ===== Table rendering =====

function renderTableV2(tableConfig, allData, showYears, year, month) {
    const { title, id, indicators } = tableConfig;
    const comments = summaryBlockComments.filter(c => c.report_type === 'monthly' && c.block_id === id);
    const existingComment = comments[0];

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_${id}">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">${title}</span>
        </div>
        <div class="monthly-table-body" id="mt_${id}">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr>
                <th>Показники</th>
                ${showYears.map(y => `<th>${y} рік</th>`).join('')}
                <th>${MO[month-1]} ${year}</th>
                <th>%Δ до попер.місяця</th>
            </tr></thead>
            <tbody>`;

    for (const config of indicators) {
        const displayName = config.sub
            ? `<span class="indent-sub">→ ${config.name}</span>`
            : (config.bold ? `<b>${config.name}</b>` : config.name);

        let cells = `<td class="ind-name">${displayName}</td>`;

        // Year columns
        for (const y of showYears) {
            if (y > year) { cells += '<td>—</td>'; continue; }
            if (y === year) {
                const ytd = computeYtd(config, allData, y, month);
                cells += `<td><b>${ytd.display}</b></td>`;
            } else {
                const past = getPastYearValue(config, allData, y);
                cells += `<td>${past.display}</td>`;
            }
        }

        // Month column
        const monthRec = findMonthRecord(config.name, allData, year, month);
        const prevMonthRec = month > 1
            ? findMonthRecord(config.name, allData, year, month - 1)
            : findMonthRecord(config.name, allData, year - 1, 12);

        let monthDisplay = '—';
        if (monthRec) {
            if (isVolPriceText(monthRec.value_text)) {
                monthDisplay = toSlash(monthRec.value_text);
            } else if (monthRec.value_numeric != null) {
                monthDisplay = fN(monthRec.value_numeric);
            } else if (monthRec.value_text) {
                monthDisplay = monthRec.value_text;
            }
        }
        cells += `<td><b>${monthDisplay}</b></td>`;

        // Delta
        const curVal = monthRec?.value_numeric;
        const prevVal = prevMonthRec?.value_numeric;
        const delta = deltaBadge(curVal, prevVal);
        cells += `<td class="${delta.cls}">${delta.html || '—'}</td>`;

        // Annotation dot on first cell
        const safeName = config.name.replace(/"/g, '&quot;');
        cells = cells.replace(/^<td>/, `<td><span class="cell-text">`);
        cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${safeName}"></span></td>`);

        html += `<tr class="clickable-row" data-indicator="${safeName}" style="cursor:pointer">${cells}</tr>`;
    }

    html += '</tbody></table></div>';

    // Block comment
    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment monthly-comment-block">
        <textarea class="ws-comment-input monthly-comment" data-block="${id}" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="${id}">Зберегти</button>
    </div></div></div>`;

    return html;
}

// ===== Salary table =====
// Dynamic branch list from data (same logic as v1) — no hardcoded config

function renderSalaryTableV2(allData, showYears, year, month) {
    // Use config branch list — exact names from Excel summary sheet
    const configBranches = SALARY_TABLE.order || [];

    // Show only branches that have data for the selected year
    const branchNames = [];
    const salaryRows = [];
    console.log(`[salary debug] year=${year}, configBranches=${configBranches.length}`);
    for (const branch of configBranches) {
        const branchRecords = allData.filter(r => r.indicator_name === branch);
        const yearRecords = branchRecords.filter(r => r.year === year && r.value_numeric != null);
        const hasYearData = yearRecords.length > 0;
        if (branch === 'Південний' || branch === 'Північний') {
            console.log(`[salary debug] ${branch}: total=${branchRecords.length}, year${year}=${yearRecords.length}, hasData=${hasYearData}`, yearRecords);
        }
        if (hasYearData) {
            branchNames.push(branch);
            salaryRows.push(...allData.filter(r => r.indicator_name === branch));
        }
    }
    if (!branchNames.length) return '';

    const regionData = allData.filter(r => r.indicator_group === 'region_salary');

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_${SALARY_TABLE.id}">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">${SALARY_TABLE.title}</span>
        </div>
        <div class="monthly-table-body" id="mt_${SALARY_TABLE.id}">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr><th>Філія</th>${showYears.map(y=>`<th>${y} рік</th>`).join('')}
            <th>${MO[month-1]} ${year}</th><th>%Δ до попер.місяця</th>
            <th>Сер. з/п в регіоні</th>
            </tr></thead><tbody>`;

    for (const name of branchNames) {
        const rows = salaryRows.filter(r => r.indicator_name === name);
        let cells = `<td class="ind-name">${name}</td>`;

        for (const y of showYears) {
            if (y > year) { cells += '<td>—</td>'; continue; }
            // Show exact value from Excel (annual record) — no formulas
            const ann = rows.find(r => r.year === y && r.month === 0);
            const isCur = y === year;
            if (ann?.value_numeric != null) {
                cells += `<td>${isCur ? '<b>' : ''}${fN(ann.value_numeric)}${isCur ? '</b>' : ''}</td>`;
            } else {
                cells += `<td>${isCur ? '<b>' : ''}—${isCur ? '</b>' : ''}</td>`;
            }
        }

        // Current month + delta
        const cur = rows.find(r => r.year === year && r.month === month);
        const prev = month > 1
            ? rows.find(r => r.year === year && r.month === month - 1)
            : rows.find(r => r.year === year - 1 && r.month === 12);
        const curVal = cur?.value_numeric;
        const prevVal = prev?.value_numeric;
        cells += `<td><b>${curVal != null ? fN(curVal) : '—'}</b></td>`;
        const delta = deltaBadge(curVal, prevVal);
        cells += `<td class="${delta.cls}">${delta.html || '—'}</td>`;

        // Region salary
        const regionRec = regionData.find(r => r.indicator_name === name);
        cells += `<td>${regionRec?.value_numeric != null ? fN(regionRec.value_numeric) : '—'}</td>`;

        const safeName = name.replace(/"/g, '&quot;');
        cells = cells.replace(/^<td>/, `<td><span class="cell-text">`);
        cells = cells.replace(/<\/td>/, `</span><span class="cell-anno-dot" data-indicator="${safeName}"></span></td>`);
        html += `<tr class="clickable-row" data-indicator="${safeName}" style="cursor:pointer">${cells}</tr>`;
    }

    html += '</tbody></table></div></div></div>';
    return html;
}

// ===== Animal table =====

function renderAnimalTableV2(allData, showYears, year) {
    const animalData = allData.filter(r => r.indicator_group === 'animals');
    if (!animalData.length) return '';

    // Use config order, then add any extras not in config
    const configOrder = ANIMALS_TABLE.order || [];
    const allAnimalNames = [...new Set(animalData.map(r => r.indicator_name))];
    const orderedNames = [];
    for (const prefix of configOrder) {
        const match = allAnimalNames.find(n => n.startsWith(prefix));
        if (match && !orderedNames.includes(match)) orderedNames.push(match);
    }
    for (const n of allAnimalNames) {
        if (!orderedNames.includes(n)) orderedNames.push(n);
    }

    const visibleYears = showYears.filter(y => y <= year);

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_${ANIMALS_TABLE.id}">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">${ANIMALS_TABLE.title}</span>
        </div>
        <div class="monthly-table-body" id="mt_${ANIMALS_TABLE.id}">
        <div class="tbl-wrap"><table class="tbl monthly-tbl">
            <thead><tr><th>Тварина</th>${visibleYears.map(y=>`<th>${y}</th>`).join('')}</tr></thead><tbody>`;

    for (const name of orderedNames) {
        let cells = `<td>${name}</td>`;
        for (const y of visibleYears) {
            const rec = animalData.find(r => r.indicator_name === name && r.year === y);
            cells += `<td>${rec?.value_text || (rec?.value_numeric != null ? fN(rec.value_numeric) : '—')}</td>`;
        }
        html += `<tr>${cells}</tr>`;
    }

    html += '</tbody></table></div></div></div>';
    return html;
}

// ===== Reference block =====

function renderReferenceV2(allData, year, month) {
    const refData = allData.filter(r => r.indicator_group === 'reference');
    if (!refData.length) return '';

    // Find reference for current month or latest available
    let ref = refData.find(r => r.year === year && r.month === month);
    if (!ref) ref = refData.sort((a, b) => (b.year - a.year) || (b.month - a.month))[0];
    if (!ref?.value_text) return '';

    let html = `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_${REFERENCE_BLOCK.id}">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">${REFERENCE_BLOCK.title}</span>
        </div>
        <div class="monthly-table-body" id="mt_${REFERENCE_BLOCK.id}">
        <div style="padding:8px 12px;font-size:12px;line-height:1.6;color:var(--text2)">`;

    const lines = ref.value_text.split('\n');
    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const hasUp = /⬆|\(\+/.test(t);
        const hasDown = /⬇|\(\-/.test(t);
        if (/^[А-ЯЄЇҐA-Z\s]+:$/.test(t)) {
            html += `<div style="font-weight:700;margin-top:8px;color:var(--text1)">${t}</div>`;
        } else {
            const color = hasUp ? 'color:#c0392b' : hasDown ? 'color:#27ae60' : '';
            html += `<div style="${color}">${t}</div>`;
        }
    }

    html += '</div></div></div>';
    return html;
}

// ===== Helpers =====

function getLatestMonth(year, allData) {
    const months = allData
        .filter(r => r.year === year && r.month > 0 && r.value_numeric != null
            && (!r.sub_type || r.sub_type === 'value'))
        .map(r => r.month);
    return months.length ? Math.max(...months) : null;
}
