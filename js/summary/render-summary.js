// ===== Summary Page Rendering =====
import { $, fmt, show, hide, themeColor } from '../utils.js';
import { charts } from '../state.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { summaryIndicators, summaryWeekly, summaryWeeklyNotes, summaryFilterState, setSummaryFilterState } from './state-summary.js';

const MO = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

// ===== Main Render =====

export function renderSummaryDashboard() {
    if (!summaryIndicators.length && !summaryWeekly.length) {
        show('summaryEmptyState');
        hide('summaryContent');
        return;
    }
    hide('summaryEmptyState');
    $('summaryContent').style.display = '';

    const years = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const selYear = summaryFilterState.year || (years.length ? years[years.length - 1] : new Date().getFullYear());
    const selGroup = summaryFilterState.group || 'all';

    populateYearSelect(years, selYear);
    renderKpiCards(selYear);
    renderWeeklyBriefing();
    renderGroupTabs(selGroup);
    renderPivotTable(selYear, selGroup);
    renderYearlySummary(years);
    renderCharts(selYear);
}

// ===== Year Selector =====

function populateYearSelect(years, selected) {
    const sel = $('summaryYearSelect');
    if (!sel) return;
    sel.innerHTML = years.map(y =>
        `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`
    ).join('');
    sel.onchange = () => {
        setSummaryFilterState({ ...summaryFilterState, year: parseInt(sel.value) });
        renderSummaryDashboard();
    };
}

// ===== KPI Cards =====

function getLatestValue(indicatorPattern, group, year) {
    const matches = summaryIndicators.filter(r =>
        r.indicator_name.toLowerCase().includes(indicatorPattern.toLowerCase()) &&
        (!group || r.indicator_group === group) &&
        r.sub_type === 'value' &&
        r.value_numeric != null
    );
    // Get annual (month=0) for the year, or latest month
    const annual = matches.find(r => r.year === year && r.month === 0);
    if (annual) return { value: annual.value_numeric, year };
    const monthly = matches.filter(r => r.year === year && r.month > 0).sort((a, b) => b.month - a.month);
    if (monthly.length) return { value: monthly[0].value_numeric, month: monthly[0].month, year };
    return null;
}

function getSparkData(indicatorPattern, group, year) {
    return summaryIndicators
        .filter(r =>
            r.indicator_name.toLowerCase().includes(indicatorPattern.toLowerCase()) &&
            (!group || r.indicator_group === group) &&
            r.sub_type === 'value' && r.month > 0 && r.year === year && r.value_numeric != null
        )
        .sort((a, b) => a.month - b.month)
        .map(r => r.value_numeric);
}

function getYoyChange(indicatorPattern, group, year) {
    const cur = getLatestValue(indicatorPattern, group, year);
    const prev = getLatestValue(indicatorPattern, group, year - 1);
    if (cur && prev && prev.value !== 0) {
        return ((cur.value - prev.value) / Math.abs(prev.value) * 100);
    }
    return null;
}

const KPI_ICONS = {
    revenue: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    payroll: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>',
    headcount: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    salary: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></svg>',
    harvest: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V8M5 12l7-8 7 8"/><path d="M8 22h8M3 18l4-4M21 18l-4-4"/></svg>'
};

function renderKpiCards(year) {
    const grid = $('kpiGridSummary');
    if (!grid) return;

    const cards = [
        { label: 'Загальний дохід', pattern: 'загальна реалізація', group: 'revenue', unit: 'млн грн', color: 'neon-primary', icon: KPI_ICONS.revenue, divisor: 1 },
        { label: 'ФОП', pattern: 'фонд оплати праці', group: 'finance', unit: 'млн грн', color: 'neon-secondary', icon: KPI_ICONS.payroll, divisor: 1 },
        { label: 'Чисельність', pattern: 'чисельність', group: 'finance', unit: '', color: 'neon-accent', icon: KPI_ICONS.headcount, divisor: 1 },
        { label: 'Середня зарплата', pattern: 'середня заробітна', group: 'finance', unit: 'грн', color: 'neon-amber', icon: KPI_ICONS.salary, divisor: 1 },
        { label: 'Залишки коштів', pattern: 'залишок коштів', group: 'finance', unit: 'млн грн', color: 'neon-green', icon: KPI_ICONS.cash, divisor: 1 },
        { label: 'Заготівля', pattern: 'заготівля деревини', group: 'forestry', unit: 'тис. м³', color: 'neon-rose', icon: KPI_ICONS.harvest, divisor: 1 },
    ];

    grid.innerHTML = cards.map(c => {
        const data = getLatestValue(c.pattern, c.group, year);
        const val = data ? data.value : null;
        const change = getYoyChange(c.pattern, c.group, year);
        const spark = getSparkData(c.pattern, c.group, year);
        const isPartial = data && data.month && data.month < 12;
        const fmtVal = val != null ? fmt(val / c.divisor, val > 100000 ? 0 : 1) : '—';

        return `<div class="glass kpi-card kpi-card-summary ${c.color}">
            <div class="kpi-label"><span class="kpi-icon">${c.icon}</span>${c.label}${isPartial ? ` <small style="opacity:.6">(${MO[data.month - 1]})</small>` : ''}</div>
            <div class="kpi-row">
                <div><div class="kpi-value">${fmtVal}<span class="kpi-unit">${c.unit}</span></div>
                ${change != null ? `<div class="kpi-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(change).toFixed(1)}%</div>` : ''}
                <div class="kpi-sub">${year} рік</div></div>
                ${spark.length > 2 ? `<div class="sparkline-wrap"><canvas width="80" height="30" data-spark-idx="${c.label}"></canvas></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Draw sparklines with area fill
    cards.forEach(c => {
        const canvas = grid.querySelector(`canvas[data-spark-idx="${c.label}"]`);
        if (!canvas) return;
        const spark = getSparkData(c.pattern, c.group, year);
        if (spark.length > 2) drawSparklineWithFill(canvas, spark, themeColor('--primary'));
    });
}

function drawSparklineWithFill(canvas, data, color) {
    if (!data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    let max = -Infinity, min = Infinity;
    for (let i = 0; i < data.length; i++) { if (data[i] > max) max = data[i]; if (data[i] < min) min = data[i]; }
    const range = max - min || 1;
    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * w,
        y: h - ((v - min) / range) * (h - 4) - 2
    }));
    // Area fill
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color.replace(')', ',0.12)').replace('rgb(', 'rgba(');
    if (!ctx.fillStyle.includes('rgba')) ctx.fillStyle = 'rgba(74,157,111,0.12)';
    ctx.fill();
    // Line
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
}

// ===== Weekly Briefing =====

function renderWeeklyBriefing() {
    const card = $('summaryWeeklyCard');
    if (!card) return;

    if (!summaryWeekly.length) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    // Get latest report date
    const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
    const latestDate = dates[0];
    const latestData = summaryWeekly.filter(r => r.report_date === latestDate);
    const kpiData = latestData.filter(r => r.section === 'kpi');

    // Date label
    const sub = $('summaryWeeklyDate');
    if (sub) sub.textContent = `Станом на ${formatDate(latestDate)}`;

    // Notes
    const latestNotes = summaryWeeklyNotes.filter(n => n.report_date === latestDate);
    renderWeeklyNotes(latestNotes);

    // KPI table
    const tbody = $('tblBodyWeekly');
    if (!tbody) return;

    if (!kpiData.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }

    tbody.innerHTML = kpiData.map(r => {
        const delta = r.value_delta;
        const deltaStr = delta != null ? (delta >= 0 ? `+${fmtNum(delta)}` : fmtNum(delta)) : '—';
        const deltaCls = delta != null ? (delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : '') : '';
        return `<tr>
            <td><b>${r.indicator_name}</b></td>
            <td>${fmtNum(r.value_current)}</td>
            <td>${fmtNum(r.value_previous)}</td>
            <td>${fmtNum(r.value_ytd)}</td>
            <td class="${deltaCls}">${deltaStr}</td>
        </tr>`;
    }).join('');

    // Weekly section details (tabs below KPI table)
    renderWeeklySectionTabs(latestData, latestDate);
}

function renderWeeklyNotes(notes) {
    const container = $('summaryNotesBlock');
    if (!container) return;
    if (!notes.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    const typeConfig = {
        general: { label: 'Загальна оцінка', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>', cls: 'note-general' },
        events: { label: 'Ключові події', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>', cls: '' },
        positive: { label: 'Позитивна динаміка', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>', cls: 'note-positive' },
        negative: { label: 'Негативна / ризикова', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', cls: 'note-negative' },
        decisions: { label: 'Питання для рішення', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', cls: 'note-warning' }
    };

    // General note first (full width), then grid for others
    const generalNote = notes.find(n => n.note_type === 'general');
    const otherNotes = notes.filter(n => n.note_type !== 'general');

    let html = '';
    if (generalNote) {
        const cfg = typeConfig.general;
        html += `<div class="weekly-note ${cfg.cls}">
            <div class="note-label">${cfg.icon} ${cfg.label}</div>
            <div class="note-text">${generalNote.content.replace(/\n/g, '<br>')}</div>
        </div>`;
    }
    if (otherNotes.length) {
        html += '<div class="notes-grid">';
        html += otherNotes.map(n => {
            const cfg = typeConfig[n.note_type] || { label: n.note_type, icon: '', cls: '' };
            return `<div class="weekly-note ${cfg.cls}">
                <div class="note-label">${cfg.icon} ${cfg.label}</div>
                <div class="note-text">${n.content.replace(/\n/g, '<br>')}</div>
            </div>`;
        }).join('');
        html += '</div>';
    }
    container.innerHTML = html;
}

// Section category grouping for two-level navigation
const SECTION_CATEGORIES = [
    {
        id: 'operations', label: 'Операційна',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        sections: ['harvesting', 'sales', 'contracts']
    },
    {
        id: 'forest', label: 'Ліси та земля',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V8M5 12l7-8 7 8"/><path d="M8 22h8"/></svg>',
        sections: ['forest_protection', 'certification', 'land_self_forested', 'land_reforestation', 'land_reserves']
    },
    {
        id: 'security', label: 'Безпека',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        sections: ['raids', 'mru_raids', 'demining', 'zsu']
    },
    {
        id: 'finance', label: 'Фінанси',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
        sections: ['finance', 'personnel', 'procurement']
    },
    {
        id: 'legal', label: 'Правові',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8l-8 8M8 8l8 8"/></svg>',
        sections: ['legal']
    }
];

const SECTION_LABELS = {
    forest_protection: 'Охорона лісу', raids: 'Рейди', mru_raids: 'Спільні рейди',
    demining: 'Розмінування', certification: 'Сертифікація',
    land_self_forested: 'Самозалісені', land_reforestation: 'Лісорозведення',
    land_reserves: 'Запас', harvesting: 'Заготівля', contracts: 'Договори',
    sales: 'Реалізація', finance: 'Фінанси', personnel: 'Персонал',
    legal: 'Правові питання', procurement: 'Закупівлі', zsu: 'ЗСУ'
};

function renderWeeklySectionTabs(data, date) {
    const container = $('summaryWeeklySections');
    if (!container) return;

    const availSections = new Set(data.filter(r => r.section !== 'kpi').map(r => r.section));
    if (!availSections.size) { container.style.display = 'none'; return; }
    container.style.display = '';

    // Filter categories that have data
    const activeCategories = SECTION_CATEGORIES
        .map(cat => ({ ...cat, sections: cat.sections.filter(s => availSections.has(s)) }))
        .filter(cat => cat.sections.length);

    if (!activeCategories.length) { container.style.display = 'none'; return; }

    container.innerHTML = `
        <div class="ws-category-bar"></div>
        <div class="ws-section-bar"></div>
        <div class="ws-section-table"></div>
    `;

    const catBar = container.querySelector('.ws-category-bar');
    const secBar = container.querySelector('.ws-section-bar');
    const tableWrap = container.querySelector('.ws-section-table');

    // Render category pills
    catBar.innerHTML = activeCategories.map((cat, i) =>
        `<button class="ws-cat-pill${i === 0 ? ' active' : ''}" data-cat="${cat.id}">${cat.icon}<span>${cat.label}</span></button>`
    ).join('');

    function showCategory(catId) {
        const cat = activeCategories.find(c => c.id === catId);
        if (!cat) return;

        // Update category active state
        catBar.querySelectorAll('.ws-cat-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === catId));

        // Render section tabs for this category
        secBar.innerHTML = cat.sections.map((s, i) =>
            `<button class="ws-sec-tab${i === 0 ? ' active' : ''}" data-ws="${s}">${SECTION_LABELS[s] || s}</button>`
        ).join('');

        // Wire section tabs
        secBar.querySelectorAll('.ws-sec-tab').forEach(btn => {
            btn.onclick = () => {
                secBar.querySelectorAll('.ws-sec-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                showSectionData(btn.dataset.ws);
            };
        });

        // Show first section
        showSectionData(cat.sections[0]);
    }

    function showSectionData(section) {
        const sData = data.filter(r => r.section === section);
        const hasCurrent = sData.some(r => r.value_current != null);
        const hasPrevious = sData.some(r => r.value_previous != null);
        const hasYtd = sData.some(r => r.value_ytd != null);
        const hasDelta = sData.some(r => r.value_delta != null);

        let cols = ['Показник'];
        if (hasCurrent) cols.push('За тиждень');
        if (hasPrevious) cols.push('Попередній');
        if (hasYtd) cols.push('З поч. року');
        if (hasDelta) cols.push('Δ');

        tableWrap.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
            sData.map(r => {
                let cells = `<td>${r.indicator_name}</td>`;
                if (hasCurrent) cells += `<td>${r.value_text || fmtNum(r.value_current)}</td>`;
                if (hasPrevious) cells += `<td>${fmtNum(r.value_previous)}</td>`;
                if (hasYtd) cells += `<td>${fmtNum(r.value_ytd)}</td>`;
                if (hasDelta) {
                    const d = r.value_delta;
                    const cls = d != null ? (d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : '') : '';
                    cells += `<td class="${cls}">${d != null ? (d >= 0 ? '+' : '') + fmtNum(d) : '—'}</td>`;
                }
                return `<tr>${cells}</tr>`;
            }).join('')
        }</tbody></table></div>`;
    }

    // Wire category pills
    catBar.querySelectorAll('.ws-cat-pill').forEach(btn => {
        btn.onclick = () => showCategory(btn.dataset.cat);
    });

    // Show first category
    showCategory(activeCategories[0].id);
}

// ===== Group Toggle Tabs =====

function renderGroupTabs(activeGroup) {
    const bar = $('tglSummaryGroup');
    if (!bar) return;
    bar.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.g === activeGroup);
        btn.onclick = () => {
            setSummaryFilterState({ ...summaryFilterState, group: btn.dataset.g });
            renderSummaryDashboard();
        };
    });
}

// ===== Pivot Table =====

function renderPivotTable(year, group) {
    const head = $('summaryIndicatorsHead');
    const tbody = $('tblBodyIndicators');
    if (!head || !tbody) return;

    // Filter data for this year, monthly only (month > 0)
    let data = summaryIndicators.filter(r => r.year === year && r.month > 0);
    if (group !== 'all') data = data.filter(r => r.indicator_group === group);

    // Get unique indicator names preserving order
    const seen = new Set();
    const indicators = [];
    data.forEach(r => {
        const key = `${r.indicator_name}|${r.sub_type}`;
        if (!seen.has(key)) {
            seen.add(key);
            indicators.push({ name: r.indicator_name, sub_type: r.sub_type, group: r.indicator_group });
        }
    });

    // Group volume+price pairs
    const volPriceNames = new Set();
    indicators.forEach(ind => {
        if (ind.sub_type === 'volume' || ind.sub_type === 'price') volPriceNames.add(ind.name);
    });

    // Build display rows: merge volume+price into one row
    const displayRows = [];
    const processedVP = new Set();
    indicators.forEach(ind => {
        if (volPriceNames.has(ind.name)) {
            if (processedVP.has(ind.name)) return;
            processedVP.add(ind.name);
            displayRows.push({ name: ind.name, type: 'volprice', group: ind.group });
        } else {
            displayRows.push({ name: ind.name, type: 'value', group: ind.group });
        }
    });

    const curMonth = new Date().getMonth(); // 0-indexed
    head.innerHTML = `<tr><th>Показник</th>${MO.map((m, i) => `<th${year === new Date().getFullYear() && i === curMonth ? ' class="month-current"' : ''}>${m}</th>`).join('')}<th>Рік</th></tr>`;

    // Previous year data for coloring
    const prevData = summaryIndicators.filter(r => r.year === year - 1 && r.month > 0);

    tbody.innerHTML = displayRows.map(row => {
        const cells = [];
        let yearTotal = 0;
        let yearCount = 0;

        for (let m = 1; m <= 12; m++) {
            if (row.type === 'volprice') {
                const vol = data.find(r => r.indicator_name === row.name && r.sub_type === 'volume' && r.month === m);
                const price = data.find(r => r.indicator_name === row.name && r.sub_type === 'price' && r.month === m);
                if (vol || price) {
                    const vStr = vol && vol.value_numeric != null ? fmtNum(vol.value_numeric) : '—';
                    const pStr = price && price.value_numeric != null ? fmtNum(price.value_numeric) : '—';
                    cells.push(`<td class="volprice-cell"><span class="vp-vol">${vStr}</span><span class="vp-sep">/</span><span class="vp-price">${pStr}</span></td>`);
                    if (vol && vol.value_numeric != null) { yearTotal += vol.value_numeric; yearCount++; }
                } else {
                    cells.push('<td class="cell-empty">—</td>');
                }
            } else {
                const rec = data.find(r => r.indicator_name === row.name && r.sub_type === 'value' && r.month === m);
                if (rec) {
                    if (rec.value_text) {
                        cells.push(`<td class="cell-text">${rec.value_text}</td>`);
                    } else if (rec.value_numeric != null) {
                        // Color vs previous year
                        const prev = prevData.find(r => r.indicator_name === row.name && r.sub_type === 'value' && r.month === m);
                        let cls = '';
                        if (prev && prev.value_numeric != null && prev.value_numeric !== 0) {
                            const diff = (rec.value_numeric - prev.value_numeric) / Math.abs(prev.value_numeric);
                            if (diff > 0.05) cls = 'cell-up';
                            else if (diff < -0.05) cls = 'cell-down';
                        }
                        cells.push(`<td class="${cls}">${fmtNum(rec.value_numeric)}</td>`);
                        yearTotal += rec.value_numeric;
                        yearCount++;
                    } else {
                        cells.push('<td class="cell-empty">—</td>');
                    }
                } else {
                    cells.push('<td class="cell-empty">—</td>');
                }
            }
        }

        // Year total column
        const annual = summaryIndicators.find(r =>
            r.indicator_name === row.name && r.year === year && r.month === 0 &&
            (row.type === 'volprice' ? r.sub_type === 'volume' : r.sub_type === 'value') &&
            r.value_numeric != null
        );
        const yearVal = annual ? annual.value_numeric : (yearCount > 0 ? yearTotal : null);
        const yearCell = yearVal != null ? `<td class="cell-year"><b>${fmtNum(yearVal)}</b></td>` : '<td>—</td>';

        const groupCls = `group-${row.group}`;
        return `<tr class="${groupCls}"><td class="ind-name">${row.name}</td>${cells.join('')}${yearCell}</tr>`;
    }).join('');
}

// ===== Yearly Summary Table =====

function renderYearlySummary(years) {
    const tbody = $('tblBodyYearly');
    if (!tbody) return;

    const keyIndicators = [
        { pattern: 'загальна реалізація', label: 'Загальний дохід, млн грн' },
        { pattern: 'фонд оплати праці', label: 'ФОП, млн грн' },
        { pattern: 'чисельність', label: 'Чисельність' },
        { pattern: 'середня заробітна', label: 'Середня зарплата, грн' },
        { pattern: 'залишок коштів', label: 'Залишки коштів, млн грн' },
        { pattern: 'дебіторськ', label: 'Дебіторка, млн грн' },
        { pattern: 'кредиторськ', label: 'Кредиторка, млн грн' },
        { pattern: 'заготівля деревини', label: 'Заготівля, тис м³' },
        { pattern: 'реалізація лісоматеріалів круглих, тис', label: 'Реалізація кругляку, тис м³' },
    ];

    // Header
    const head = $('summaryYearlyHead');
    if (head) {
        head.innerHTML = `<tr><th>Показник</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Тренд</th></tr>`;
    }

    tbody.innerHTML = keyIndicators.map(ki => {
        const vals = years.map(y => {
            // Prefer annual (month=0), fallback to latest month
            const annual = summaryIndicators.find(r =>
                r.indicator_name.toLowerCase().includes(ki.pattern) &&
                r.sub_type === 'value' && r.year === y && r.month === 0 && r.value_numeric != null
            );
            if (annual) return annual.value_numeric;
            const monthly = summaryIndicators.filter(r =>
                r.indicator_name.toLowerCase().includes(ki.pattern) &&
                r.sub_type === 'value' && r.year === y && r.month > 0 && r.value_numeric != null
            ).sort((a, b) => b.month - a.month);
            return monthly.length ? monthly[0].value_numeric : null;
        });

        const numVals = vals.filter(v => v != null);
        let trend = '—';
        if (numVals.length >= 2) {
            const first = numVals[0], last = numVals[numVals.length - 1];
            if (first !== 0) {
                const pct = (last - first) / Math.abs(first) * 100;
                trend = pct > 5 ? `<span class="delta-up">↗ +${pct.toFixed(0)}%</span>` :
                    pct < -5 ? `<span class="delta-down">↘ ${pct.toFixed(0)}%</span>` :
                        `<span>→ ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%</span>`;
            }
        }

        return `<tr>
            <td>${ki.label}</td>
            ${vals.map(v => `<td>${v != null ? fmtNum(v) : '—'}</td>`).join('')}
            <td>${trend}</td>
        </tr>`;
    }).join('');
}

// ===== Charts =====

function renderCharts(year) {
    renderRevenueChart(year);
    renderPayrollChart(year);
    renderProductionChart(year);
    renderPriceChart(year);
}

function getMonthlyData(pattern, group, year, subType = 'value') {
    const data = new Array(12).fill(null);
    summaryIndicators
        .filter(r => r.indicator_name.toLowerCase().includes(pattern.toLowerCase()) &&
            (!group || r.indicator_group === group) &&
            r.sub_type === subType && r.year === year && r.month > 0 && r.value_numeric != null)
        .forEach(r => { data[r.month - 1] = r.value_numeric; });
    return data;
}

function renderRevenueChart(year) {
    kill('cSummaryRevenue');
    const canvas = freshCanvas('wrapSummaryRevenue', 'cSummaryRevenue');
    const ctx = canvas.getContext('2d');

    const cur = getMonthlyData('загальна реалізація', 'revenue', year);
    const prev = getMonthlyData('загальна реалізація', 'revenue', year - 1);
    const labels = MO.slice(0, 12);

    charts._summaryRevenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: `${year}`, data: cur, backgroundColor: makeGrad(ctx, 74, 157, 111), borderRadius: 4, order: 1 },
                { label: `${year - 1}`, data: prev, backgroundColor: 'rgba(150,150,150,0.25)', borderRadius: 4, order: 2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderPayrollChart(year) {
    kill('cSummaryPayroll');
    const canvas = freshCanvas('wrapSummaryPayroll', 'cSummaryPayroll');
    const ctx = canvas.getContext('2d');

    const salary = getMonthlyData('середня заробітна', 'finance', year);
    const count = getMonthlyData('чисельність', 'finance', year);

    charts._summaryPayroll = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MO,
            datasets: [
                { label: 'Зарплата, грн', data: salary, borderColor: themeColor('--primary'), yAxisID: 'y', tension: 0.3, pointRadius: 3 },
                { label: 'Чисельність', data: count, borderColor: themeColor('--secondary'), yAxisID: 'y1', tension: 0.3, pointRadius: 3, borderDash: [5, 3] }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: {
                y: { type: 'linear', position: 'left', beginAtZero: false },
                y1: { type: 'linear', position: 'right', beginAtZero: false, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function renderProductionChart(year) {
    kill('cSummaryProduction');
    const canvas = freshCanvas('wrapSummaryProduction', 'cSummaryProduction');
    const ctx = canvas.getContext('2d');

    const species = [
        { pattern: 'сосна тис', label: 'Сосна', color: '#4CAF50' },
        { pattern: 'дуб тис', label: 'Дуб', color: '#FF9800' },
        { pattern: 'вільха', label: 'Вільха/Береза', color: '#2196F3' },
        { pattern: 'інші тис', label: 'Інші', color: '#9C27B0' },
    ];

    charts._summaryProd = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MO,
            datasets: species.map(s => ({
                label: s.label,
                data: getMonthlyData(s.pattern, 'production', year, 'volume'),
                backgroundColor: s.color + '99',
                borderRadius: 2
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        }
    });
}

function renderPriceChart(year) {
    kill('cSummaryYoy');
    const canvas = freshCanvas('wrapSummaryYoy', 'cSummaryYoy');
    const ctx = canvas.getContext('2d');

    const species = [
        { pattern: 'сосна тис', label: 'Сосна', color: '#4CAF50' },
        { pattern: 'дуб тис', label: 'Дуб', color: '#FF9800' },
        { pattern: 'вільха', label: 'Вільха/Береза', color: '#2196F3' },
    ];

    charts._summaryPrice = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MO,
            datasets: species.map(s => ({
                label: s.label,
                data: getMonthlyData(s.pattern, 'production', year, 'price'),
                borderColor: s.color, tension: 0.3, pointRadius: 3, fill: false
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: { y: { beginAtZero: false } }
        }
    });
}

// ===== Helpers =====

function fmtNum(v) {
    if (v == null) return '—';
    if (Math.abs(v) >= 1000) return v.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

function formatDate(d) {
    if (!d) return '';
    const p = String(d).split('-');
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
    return d;
}
