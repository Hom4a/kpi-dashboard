// ===== Monthly Report — "Дод 1 до ТЗ" format =====
import { $, fmt } from '../utils.js';
import { summaryIndicators, summaryFilterState, summaryBlockComments } from './state-summary.js';
import { saveBlockComment } from './db-summary.js';
import { openMonthlyIndicatorModal } from './infographic-modal.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
            'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function fN(v) {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (Math.abs(v) >= 1000) return v.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

function deltaBadge(cur, prev) {
    if (cur == null || prev == null) return '';
    if (typeof cur === 'string' || typeof prev === 'string') return '';
    if (prev === 0) {
        if (cur === 0) return '';
        return `<span class="pivot-badge-orange">${cur > 0 ? '+' : ''}${fN(cur)}</span>`;
    }
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
    if (pct === 0) return '';
    return pct > 0
        ? `<span class="pivot-badge-up">+${pct}%</span>`
        : `<span class="pivot-badge-down">${pct}%</span>`;
}

function deltaCls(cur, prev) {
    if (cur == null || prev == null || typeof cur === 'string' || typeof prev === 'string') return '';
    if (prev === 0) return cur !== 0 ? 'cell-orange' : '';
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    return pct > 0 ? 'cell-up' : pct < 0 ? 'cell-down' : '';
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
    'Недоїмка перед бюджетом млн. грн',
    'Загальна реалізація, млн. грн',
    'в т.ч: лісоматеріали в круглому вигляді, млн. грн',
    'продукція переробки,  млн. грн',
    'інша реалізація (послуги, побічне користування тощо), млн грн',
    'Обсяг переробки, всього, тис. м3',
    'Реалізація лісоматеріалів круглих, тис. м3',
    'Середня цін реалізації 1 м3 лісоматеріалів круглих, грн/м3',
    "Реалізація деревини дров'яної ПВ  тис. м3",
    'Середня ціна реалізації 1 м3 деревини дровяної ПВ, грн/м3',
    "Реалізація деревини дров'яної НП  тис. м3",
    'Середня ціна реалізації 1 м3 деревини дровяної НП, грн/м3',
    'Реалізовано на експорт, млн. грн',
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

// Sub-indicators (indented with →)
const SUB_INDICATORS = new Set([
    'в т.ч: лісоматеріали в круглому вигляді, млн. грн',
    'продукція переробки,  млн. грн',
    'інша реалізація (послуги, побічне користування тощо), млн грн',
    'Рубки головного користування',
    'Рубки формування і оздоровлення лісів'
]);

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

// ===== Rendering =====

export function renderMonthlyReport(container, year, month) {
    if (!container) return;
    if (!month) month = getLatestMonth(year);
    if (!month) month = new Date().getMonth() + 1;

    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5);
    const allData = summaryIndicators.filter(r => r.sub_type === 'value');

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

    // Table 2: Taxes
    html += renderTable('Податки та збори', TABLE_2_ROWS, TABLE_2_SUB, showYears, year, month, allData, 'monthly_t2');

    // Table 3: Salaries by branch
    html += renderSalaryTable(showYears, year, month, allData);

    // Reference info
    html += renderReferenceBlock();

    container.innerHTML = html;

    // Wire events
    wireMonthSelect(container, year);
    wireCollapse(container);
    wireRowClicks(container);
    wireCommentSaves(container, year, month);
}

function getLatestMonth(year) {
    const months = summaryIndicators
        .filter(r => r.year === year && r.month > 0)
        .map(r => r.month);
    return months.length ? Math.max(...months) : null;
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
        const isSub = subSet.has(name);
        const displayName = isSub ? `<span class="indent-sub">→ ${name}</span>` : name;

        // Find data for this indicator
        const match = n => {
            const lower = n.toLowerCase().trim();
            return allData.filter(r => r.indicator_name.toLowerCase().trim() === lower);
        };
        let rows = match(name);
        // Fuzzy match: try partial
        if (!rows.length) {
            const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
            rows = allData.filter(r => {
                const rk = r.indicator_name.toLowerCase().replace(/\s+/g, ' ').trim();
                return rk.includes(key) || key.includes(rk);
            });
        }

        // Annual values
        let cells = `<td class="ind-name">${displayName}</td>`;
        for (const y of showYears) {
            const ann = rows.find(r => r.year === y && r.month === 0);
            const val = ann?.value_numeric;
            cells += `<td>${val != null ? fN(val) : (ann?.value_text || '—')}</td>`;
        }

        // Selected month value
        const monthRec = rows.find(r => r.year === year && r.month === month);
        const prevMonthRec = rows.find(r => r.year === year && r.month === month - 1);
        const curVal = monthRec?.value_numeric;
        const prevVal = prevMonthRec?.value_numeric;

        cells += `<td><b>${curVal != null ? fN(curVal) : (monthRec?.value_text || '—')}</b></td>`;
        cells += `<td class="${deltaCls(curVal, prevVal)}">${deltaBadge(curVal, prevVal) || '—'}</td>`;

        html += `<tr class="clickable-row" data-indicator="${name}" style="cursor:pointer">${cells}</tr>`;
    }

    html += `</tbody></table></div>`;

    // Comment area
    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment">
        <textarea class="ws-comment-input monthly-comment" data-block="${commentId}" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="${commentId}">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

function renderSalaryTable(showYears, year, month, allData) {
    const salaryRows = allData.filter(r =>
        r.indicator_group === 'salary_by_branch' ||
        r.indicator_name.toLowerCase().includes('філія') ||
        r.indicator_name.toLowerCase().includes('лісовий офіс') ||
        r.indicator_name.toLowerCase().includes('навчальний центр') ||
        r.indicator_name.toLowerCase().includes('репродуктивні')
    );

    const branchNames = [...new Set(salaryRows.map(r => r.indicator_name))].sort();
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
            </tr></thead>
            <tbody>`;

    for (const name of branchNames) {
        const rows = salaryRows.filter(r => r.indicator_name === name);
        let cells = `<td class="ind-name">${name}</td>`;
        for (const y of showYears) {
            const ann = rows.find(r => r.year === y && r.month === 0);
            cells += `<td>${ann?.value_numeric != null ? fN(ann.value_numeric) : '—'}</td>`;
        }
        const cur = rows.find(r => r.year === year && r.month === month);
        const prev = rows.find(r => r.year === year && r.month === month - 1);
        const curVal = cur?.value_numeric;
        const prevVal = prev?.value_numeric;
        cells += `<td><b>${curVal != null ? fN(curVal) : '—'}</b></td>`;
        cells += `<td class="${deltaCls(curVal, prevVal)}">${deltaBadge(curVal, prevVal) || '—'}</td>`;
        html += `<tr class="clickable-row" data-indicator="${name}" style="cursor:pointer">${cells}</tr>`;
    }

    html += `</tbody></table></div>`;

    const val = existingComment ? existingComment.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    html += `<div class="ws-block-comment">
        <textarea class="ws-comment-input monthly-comment" data-block="monthly_t3" placeholder="Коментар..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="monthly_t3">Зберегти</button>
    </div>`;

    html += `</div></div>`;
    return html;
}

function renderReferenceBlock() {
    return `<div class="monthly-table-block">
        <div class="monthly-table-header" data-collapse-target="mt_monthly_ref">
            <span class="ws-block-chevron">▼</span>
            <span class="monthly-table-title">Довідково</span>
        </div>
        <div class="monthly-table-body" id="mt_monthly_ref">
            <div class="monthly-ref-content">
                <p>Прожитковий мінімум: з 01.01.2026 — 3 209 грн. / для працездатних осіб — 3 328 грн.</p>
                <p>Мінімальна заробітна плата: з 01.01.2026 — 8 647 грн (погодинна — 52,0 грн)</p>
                <p>Середня заробітна плата в країні — 27 975 грн (січень 2026)</p>
                <p>Електроенергія: для населення з 01.06.2024 — 4,32 грн з ПДВ за 1 кВт·год</p>
            </div>
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
