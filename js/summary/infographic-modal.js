// ===== Indicator Infographic Modal =====
// Click on any indicator → modal with chart + period comparison
import { $ } from '../utils.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { charts } from '../state.js';
import { loadWeeklyIndicatorHistory, loadMonthlyIndicatorHistory } from './db-summary.js';

const MODAL_ID = 'indicatorModal';
let _chart = null;

export function initIndicatorModal() {
    let overlay = $(MODAL_ID);
    if (overlay) return;

    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = MODAL_ID;
    div.innerHTML = `<div class="modal" style="max-width:700px;width:95vw">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 id="infModalTitle" style="margin:0;font-size:16px;color:var(--text1)"></h3>
            <button id="infModalClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text2)">&times;</button>
        </div>
        <div id="infModalMeta" style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap"></div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
            <div id="infModalPeriod" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            <select id="infModalMonthSelect" class="filter-select" style="width:auto;min-width:100px;display:none"></select>
        </div>
        <div style="position:relative;height:280px">
            <canvas id="infModalChart"></canvas>
        </div>
    </div>`;
    document.body.appendChild(div);

    div.addEventListener('click', e => { if (e.target === div) closeModal(); });
    $('infModalClose').onclick = closeModal;
}

function closeModal() {
    const overlay = $(MODAL_ID);
    if (overlay) overlay.classList.remove('on');
    if (_chart) { _chart.destroy(); _chart = null; }
}

export async function openWeeklyIndicatorModal(section, indicatorName, currentVal, prevVal, delta) {
    initIndicatorModal();
    const overlay = $(MODAL_ID);
    overlay.classList.add('on');

    // Hide month selector for weekly
    const monthSel = $('infModalMonthSelect');
    if (monthSel) monthSel.style.display = 'none';

    $('infModalTitle').textContent = indicatorName;
    renderMeta(currentVal, prevVal, delta);
    renderPeriodButtons('weekly', section, indicatorName);

    await loadAndDrawWeekly(section, indicatorName, 'line');
}

let _currentIndicator = '';
let _selectedMonth = null;

export async function openMonthlyIndicatorModal(indicatorName, group) {
    initIndicatorModal();
    const overlay = $(MODAL_ID);
    overlay.classList.add('on');
    _currentIndicator = indicatorName;

    $('infModalTitle').textContent = indicatorName;
    $('infModalMeta').innerHTML = '';

    // Populate month selector from available data
    const history = await loadMonthlyIndicatorHistory(indicatorName, 'value');
    const availMonths = [...new Set(history.filter(r => r.month > 0).map(r => r.month))].sort((a, b) => a - b);
    _selectedMonth = availMonths.length ? availMonths[availMonths.length - 1] : new Date().getMonth() + 1;

    const monthSel = $('infModalMonthSelect');
    if (monthSel) {
        monthSel.style.display = '';
        monthSel.innerHTML = availMonths.map(m =>
            `<option value="${m}"${m === _selectedMonth ? ' selected' : ''}>${MO_SHORT[m - 1]}</option>`
        ).join('');
        monthSel.onchange = async () => {
            _selectedMonth = parseInt(monthSel.value);
            const activeBtn = document.querySelector('#infModalPeriod .inf-period-btn.active');
            const mode = activeBtn?.dataset.mode || 'month_vs_month';
            if (mode === 'years') await loadAndDrawMonthlyYears(_currentIndicator);
            else if (mode === 'ytd') await loadAndDrawMonthlyYTD(_currentIndicator);
            else await loadAndDrawMonthlyMonthVsMonth(_currentIndicator);
        };
    }

    renderPeriodButtons('monthly', indicatorName, group);
    await loadAndDrawMonthlyMonthVsMonth(indicatorName);
}

function renderMeta(current, prev, delta) {
    const meta = $('infModalMeta');
    if (!meta) return;

    const fN = v => v == null ? '—' : typeof v === 'number'
        ? v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : v;

    let deltaHtml = '';
    if (delta != null) {
        const cls = delta > 0 ? 'color:#4A9D6F' : delta < 0 ? 'color:#E74C3C' : 'color:#E67E22';
        deltaHtml = `<div class="inf-meta-card">
            <div class="inf-meta-label">Зміна</div>
            <div class="inf-meta-value" style="${cls}">${delta >= 0 ? '+' : ''}${fN(delta)}</div>
        </div>`;
    }

    meta.innerHTML = `
        <div class="inf-meta-card">
            <div class="inf-meta-label">Поточне</div>
            <div class="inf-meta-value">${fN(current)}</div>
        </div>
        <div class="inf-meta-card">
            <div class="inf-meta-label">Попереднє</div>
            <div class="inf-meta-value">${fN(prev)}</div>
        </div>
        ${deltaHtml}
    `;
}

function renderPeriodButtons(type, key1, key2) {
    const container = $('infModalPeriod');
    if (!container) return;

    const buttons = type === 'weekly'
        ? [
            { label: 'Останні 8 тижнів', mode: 'w8' },
            { label: 'Останні 20 тижнів', mode: 'w20' },
            { label: 'Весь період', mode: 'wall' }
        ]
        : [
            { label: 'Місяць vs місяць', mode: 'month_vs_month' },
            { label: 'По роках', mode: 'years' },
            { label: 'YTD порівняння', mode: 'ytd' }
        ];

    container.innerHTML = buttons.map((b, i) =>
        `<button class="inf-period-btn${i === 0 ? ' active' : ''}" data-mode="${b.mode}">${b.label}</button>`
    ).join('');

    container.querySelectorAll('.inf-period-btn').forEach(btn => {
        btn.onclick = async () => {
            container.querySelectorAll('.inf-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (type === 'weekly') {
                const limit = btn.dataset.mode === 'w8' ? 8 : btn.dataset.mode === 'w20' ? 20 : 52;
                await loadAndDrawWeekly(key1, key2, 'line', limit);
            } else {
                const mode = btn.dataset.mode;
                if (mode === 'years') await loadAndDrawMonthlyYears(key1);
                else if (mode === 'ytd') await loadAndDrawMonthlyYTD(key1);
                else await loadAndDrawMonthlyMonthVsMonth(key1);
            }
        };
    });
}

async function loadAndDrawWeekly(section, indicatorName, chartType, limit = 8) {
    try {
        const history = await loadWeeklyIndicatorHistory(section, indicatorName, limit);
        if (!history.length) return;

        const labels = history.map(r => {
            const d = new Date(r.report_date);
            return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
        });
        const values = history.map(r => r.value_current);
        drawChart(labels, values, indicatorName, chartType);
    } catch (e) {
        console.error('infographic weekly error:', e);
    }
}

const MO_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

// Mode 1: Same month across different years (e.g., Feb 2023 vs Feb 2024 vs Feb 2025)
async function loadAndDrawMonthlyMonthVsMonth(indicatorName) {
    try {
        const history = await loadMonthlyIndicatorHistory(indicatorName, 'value');
        if (!history.length) return;

        const targetMonth = _selectedMonth || (() => {
            const avail = history.filter(r => r.month > 0).sort((a, b) => b.month - a.month);
            return avail.length ? avail[0].month : 1;
        })();

        const sameMonth = history.filter(r => r.month === targetMonth).sort((a, b) => a.year - b.year);
        if (!sameMonth.length) return;

        const labels = sameMonth.map(r => `${MO_SHORT[r.month - 1]} ${r.year}`);
        drawChart(labels, sameMonth.map(r => r.value_numeric), indicatorName, 'bar');
    } catch (e) { console.error('infographic month-vs-month error:', e); }
}

// Mode 2: Annual totals comparison
async function loadAndDrawMonthlyYears(indicatorName) {
    try {
        const history = await loadMonthlyIndicatorHistory(indicatorName, 'value');
        if (!history.length) return;

        // Annual records (month=0) or sum monthly
        const years = [...new Set(history.map(r => r.year))].sort();
        const labels = [];
        const values = [];

        for (const y of years) {
            const annual = history.find(r => r.year === y && r.month === 0);
            if (annual) {
                labels.push(String(y));
                values.push(annual.value_numeric);
            } else {
                const monthly = history.filter(r => r.year === y && r.month > 0);
                if (monthly.length) {
                    labels.push(String(y));
                    values.push(monthly.reduce((s, r) => s + (r.value_numeric || 0), 0));
                }
            }
        }
        drawChart(labels, values, indicatorName, 'bar');
    } catch (e) { console.error('infographic years error:', e); }
}

// Mode 3: YTD (year-to-date) comparison across years
async function loadAndDrawMonthlyYTD(indicatorName) {
    try {
        const history = await loadMonthlyIndicatorHistory(indicatorName, 'value');
        if (!history.length) return;

        const upToMonth = _selectedMonth || (() => {
            const avail = history.filter(r => r.month > 0).sort((a, b) => b.month - a.month);
            return avail.length ? avail[0].month : 1;
        })();
        const years = [...new Set(history.map(r => r.year))].sort();
        const labels = [];
        const values = [];

        for (const y of years) {
            const ytdRecords = history.filter(r => r.year === y && r.month > 0 && r.month <= upToMonth);
            if (ytdRecords.length) {
                labels.push(`${y} (${MO_SHORT[0]}-${MO_SHORT[upToMonth - 1]})`);
                values.push(ytdRecords.reduce((s, r) => s + (r.value_numeric || 0), 0));
            }
        }
        drawChart(labels, values, indicatorName, 'bar');
    } catch (e) { console.error('infographic YTD error:', e); }
}

function drawChart(labels, values, label, type) {
    if (_chart) { _chart.destroy(); _chart = null; }

    const canvas = $('infModalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(74,157,111,.3)');
    gradient.addColorStop(1, 'rgba(74,157,111,.02)');

    _chart = new Chart(ctx, {
        type: type === 'bar' ? 'bar' : 'line',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                borderColor: '#4A9D6F',
                backgroundColor: type === 'bar' ? 'rgba(74,157,111,.6)' : gradient,
                borderWidth: 2,
                fill: type !== 'bar',
                tension: .3,
                pointRadius: 3,
                pointBackgroundColor: '#4A9D6F'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,.9)',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    borderColor: 'rgba(74,157,111,.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#6b7280', maxRotation: 45 } },
                y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { font: { size: 10 }, color: '#6b7280' } }
            }
        }
    });
}
