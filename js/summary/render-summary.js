// ===== Summary Page Rendering =====
import { $, fmt, show, hide, themeColor } from '../utils.js';
import { charts } from '../state.js';
import { kill, freshCanvas, makeGrad, drawSparkline } from '../charts-common.js';
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

function renderKpiCards(year) {
    const grid = $('kpiGridSummary');
    if (!grid) return;

    const cards = [
        { label: 'Загальний дохід', pattern: 'загальна реалізація', group: 'revenue', unit: 'млн грн', color: 'neon-primary', divisor: 1 },
        { label: 'ФОП', pattern: 'фонд оплати праці', group: 'finance', unit: 'млн грн', color: 'neon-secondary', divisor: 1 },
        { label: 'Чисельність', pattern: 'чисельність', group: 'finance', unit: '', color: 'neon-accent', divisor: 1 },
        { label: 'Середня зарплата', pattern: 'середня заробітна', group: 'finance', unit: 'грн', color: 'neon-amber', divisor: 1 },
        { label: 'Залишки коштів', pattern: 'залишок коштів', group: 'finance', unit: 'млн грн', color: 'neon-green', divisor: 1 },
        { label: 'Заготівля', pattern: 'заготівля деревини', group: 'forestry', unit: 'тис. м³', color: 'neon-rose', divisor: 1 },
    ];

    grid.innerHTML = cards.map(c => {
        const data = getLatestValue(c.pattern, c.group, year);
        const val = data ? data.value : null;
        const change = getYoyChange(c.pattern, c.group, year);
        const spark = getSparkData(c.pattern, c.group, year);
        const isPartial = data && data.month && data.month < 12;
        const fmtVal = val != null ? fmt(val / c.divisor, val > 100000 ? 0 : 1) : '—';

        return `<div class="glass kpi-card ${c.color}">
            <div class="kpi-label">${c.label}${isPartial ? ' <small style="opacity:.6">(${MO[data.month - 1]})</small>' : ''}</div>
            <div class="kpi-row">
                <div><div class="kpi-value">${fmtVal}<span class="kpi-unit">${c.unit}</span></div>
                ${change != null ? `<div class="kpi-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(change).toFixed(1)}%</div>` : ''}
                <div class="kpi-sub">${year} рік</div></div>
                ${spark.length > 2 ? `<div class="sparkline-wrap"><canvas width="80" height="30" data-spark-idx="${c.label}"></canvas></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Draw sparklines
    cards.forEach(c => {
        const canvas = grid.querySelector(`canvas[data-spark-idx="${c.label}"]`);
        if (!canvas) return;
        const spark = getSparkData(c.pattern, c.group, year);
        if (spark.length > 2) drawSparkline(canvas, spark, themeColor('--primary'));
    });
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

    const typeLabels = {
        general: 'Загальна оцінка', events: 'Ключові події',
        positive: 'Позитивна динаміка', negative: 'Негативна/ризикова',
        decisions: 'Питання для рішення'
    };
    const typeColors = {
        general: '', events: '', positive: 'note-positive',
        negative: 'note-negative', decisions: 'note-warning'
    };

    container.innerHTML = notes.map(n => `
        <div class="weekly-note ${typeColors[n.note_type] || ''}">
            <div class="note-label">${typeLabels[n.note_type] || n.note_type}</div>
            <div class="note-text">${n.content.replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');
}

function renderWeeklySectionTabs(data, date) {
    const container = $('summaryWeeklySections');
    if (!container) return;

    const sections = [...new Set(data.filter(r => r.section !== 'kpi').map(r => r.section))];
    if (!sections.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    const SECTION_LABELS = {
        forest_protection: 'Охорона лісу', raids: 'Рейди', mru_raids: 'Спільні рейди',
        demining: 'Розмінування', certification: 'Сертифікація',
        land_self_forested: 'Самозалісені', land_reforestation: 'Лісорозведення',
        land_reserves: 'Запас', harvesting: 'Заготівля', contracts: 'Договори',
        sales: 'Реалізація', finance: 'Фінанси', personnel: 'Персонал',
        legal: 'Правові', procurement: 'Закупівлі', zsu: 'ЗСУ'
    };

    const tabBar = container.querySelector('.toggle-bar') || document.createElement('div');
    tabBar.className = 'toggle-bar';
    tabBar.innerHTML = sections.map((s, i) =>
        `<button ${i === 0 ? 'class="active"' : ''} data-ws="${s}">${SECTION_LABELS[s] || s}</button>`
    ).join('');
    if (!container.querySelector('.toggle-bar')) container.prepend(tabBar);

    const tableWrap = container.querySelector('.tbl-wrap') || document.createElement('div');
    tableWrap.className = 'tbl-wrap';
    if (!container.querySelector('.tbl-wrap')) container.appendChild(tableWrap);

    function showSection(section) {
        const sData = data.filter(r => r.section === section);
        // Determine columns from data
        const hasCurrent = sData.some(r => r.value_current != null);
        const hasPrevious = sData.some(r => r.value_previous != null);
        const hasYtd = sData.some(r => r.value_ytd != null);
        const hasDelta = sData.some(r => r.value_delta != null);

        let cols = ['Показник'];
        if (hasCurrent) cols.push('За тиждень');
        if (hasPrevious) cols.push('Попередній');
        if (hasYtd) cols.push('З поч. року');
        if (hasDelta) cols.push('Δ');

        tableWrap.innerHTML = `<table class="tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
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
        }</tbody></table>`;
    }

    showSection(sections[0]);
    tabBar.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showSection(btn.dataset.ws);
        };
    });
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

    head.innerHTML = `<tr><th>Показник</th>${MO.map(m => `<th>${m}</th>`).join('')}<th>Рік</th></tr>`;

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
                { label: `${year}`, data: cur, backgroundColor: makeGrad(ctx, themeColor('--primary'), 0.7), borderRadius: 4, order: 1 },
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
