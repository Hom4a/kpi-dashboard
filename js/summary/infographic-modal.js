// ===== Indicator Infographic Modal =====
// Click on any indicator → modal with chart + period comparison
import { $ } from '../utils.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { charts } from '../state.js';
import { loadWeeklyIndicatorHistory, loadMonthlyIndicatorHistory } from './db-summary.js';

const MODAL_ID = 'indicatorModal';

// Filter history to same indicator type (vol/price vs regular)
function filterByType(history, indicatorName) {
    const isVP = /м3.*ціна|ціна.*грн|сер\.\s*ціна/i.test(indicatorName);
    return history.filter(r => {
        const rkIsVP = /м3.*ціна|ціна.*грн|сер\.\s*ціна/i.test(r.indicator_name);
        return isVP === rkIsVP;
    });
}
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

    await loadAndDrawWeeklyCompare(section, indicatorName);
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
    const history = filterByType(await loadMonthlyIndicatorHistory(indicatorName), indicatorName);
    const availMonths = [...new Set(history.filter(r => r.month > 0).map(r => r.month))].sort((a, b) => a - b);
    const isAnnualOnly = availMonths.length === 0;
    // Default to latest month from latest year with data
    const latestRec = history.filter(r => r.month > 0).sort((a, b) => b.year - a.year || b.month - a.month)[0];
    _selectedMonth = latestRec ? latestRec.month : (availMonths.length ? availMonths[availMonths.length - 1] : null);

    const monthSel = $('infModalMonthSelect');
    if (monthSel) {
        if (isAnnualOnly) {
            monthSel.style.display = 'none';
        } else {
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
    }

    renderPeriodButtons('monthly', indicatorName, group);
    if (isAnnualOnly) {
        await loadAndDrawMonthlyYears(indicatorName);
    } else {
        await loadAndDrawMonthlyMonthVsMonth(indicatorName);
    }
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
            { label: 'Порівняння', mode: 'compare' },
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
                if (btn.dataset.mode === 'compare') {
                    await loadAndDrawWeeklyCompare(key1, key2);
                    return;
                }
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

async function loadAndDrawWeeklyCompare(section, indicatorName) {
    try {
        const history = await loadWeeklyIndicatorHistory(section, indicatorName, 1);
        if (!history.length) return;
        const r = history[0];
        drawChart(['Попередній тиждень', 'Поточний тиждень'],
            [r.value_previous, r.value_current], indicatorName, 'bar');
    } catch (e) { console.error('infographic weekly compare error:', e); }
}

async function loadAndDrawWeekly(section, indicatorName, chartType, limit = 8) {
    try {
        const history = await loadWeeklyIndicatorHistory(section, indicatorName, limit);
        if (!history.length) return;

        const labels = [];
        const values = [];

        // Prepend virtual point from first record's value_previous
        const first = history[0];
        if (first.value_previous != null) {
            const d = new Date(first.report_date + 'T12:00:00');
            d.setDate(d.getDate() - 7);
            labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
            values.push(first.value_previous);
        }

        for (const r of history) {
            const d = new Date(r.report_date + 'T12:00:00');
            labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
            values.push(r.value_current);
        }

        const type = values.length <= 3 ? 'bar' : chartType;
        drawChart(labels, values, indicatorName, type);
    } catch (e) {
        console.error('infographic weekly error:', e);
    }
}

const MO_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

// Mode 1: Same month across different years (e.g., Feb 2023 vs Feb 2024 vs Feb 2025)
async function loadAndDrawMonthlyMonthVsMonth(indicatorName) {
    try {
        const history = filterByType(await loadMonthlyIndicatorHistory(indicatorName), indicatorName);
        if (!history.length) return;

        const targetMonth = _selectedMonth || (() => {
            const avail = history.filter(r => r.month > 0).sort((a, b) => b.month - a.month);
            return avail.length ? avail[0].month : 1;
        })();

        const sameMonth = history.filter(r => r.month === targetMonth).sort((a, b) => a.year - b.year);
        console.log(`Infographic: "${indicatorName}" month=${targetMonth}, history=${history.length}, sameMonth=${sameMonth.length}`,
            history.slice(0,5).map(r => `${r.year}/${r.month}="${r.indicator_name?.slice(0,20)}"`));
        if (!sameMonth.length) return;

        const labels = sameMonth.map(r => `${MO_SHORT[r.month - 1]} ${r.year}`);
        if (isVolPrice(sameMonth)) {
            const volumes = sameMonth.map(r => r.value_numeric);
            const prices = sameMonth.map(r => extractPrice(r.value_text));
            drawDualChart(labels, volumes, prices, indicatorName);
        } else {
            drawChart(labels, sameMonth.map(r => r.value_numeric), indicatorName, 'bar');
        }
    } catch (e) { console.error('infographic month-vs-month error:', e); }
}

// Mode 2: Annual totals comparison
async function loadAndDrawMonthlyYears(indicatorName) {
    try {
        const history = filterByType(await loadMonthlyIndicatorHistory(indicatorName), indicatorName);
        if (!history.length) return;

        // Annual records (month=0) or sum monthly
        const years = [...new Set(history.map(r => r.year))].sort();
        const labels = [];
        const values = [];

        const texts = [];
        for (const y of years) {
            const annual = history.find(r => r.year === y && r.month === 0);
            if (annual) {
                labels.push(String(y));
                values.push(annual.value_numeric);
                texts.push(annual.value_text && /[\/(]/.test(annual.value_text) ? annual.value_text : null);
            } else {
                const monthly = history.filter(r => r.year === y && r.month > 0);
                if (monthly.length) {
                    labels.push(String(y));
                    values.push(monthly.reduce((s, r) => s + (r.value_numeric || 0), 0));
                    texts.push(null);
                }
            }
        }
        const hasTexts = texts.some(t => t);
        if (hasTexts) {
            const prices = texts.map(t => extractPrice(t));
            drawDualChart(labels, values, prices, indicatorName);
        } else {
            drawChart(labels, values, indicatorName, 'bar');
        }
    } catch (e) { console.error('infographic years error:', e); }
}

// Mode 3: YTD (year-to-date) comparison across years
async function loadAndDrawMonthlyYTD(indicatorName) {
    try {
        const history = filterByType(await loadMonthlyIndicatorHistory(indicatorName), indicatorName);
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

// Extract price from value_text like "360,6(2318,7)" → 2318.7
function extractPrice(text) {
    if (!text) return null;
    const m = text.match(/\(([^)]+)\)/);
    if (!m) return null;
    return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
}

function isVolPrice(records) {
    return records.some(r => r.value_text && /\([\d,.]+\)/.test(r.value_text));
}

// Dual-axis chart: bars for volume (left Y) + line for price (right Y)
function drawDualChart(labels, volumes, prices, label) {
    if (_chart) { _chart.destroy(); _chart = null; }
    const canvas = $('infModalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const volGradients = volumes.map((v, i) => {
        const intensity = 0.4 + (i / Math.max(volumes.length - 1, 1)) * 0.4;
        const g = ctx.createLinearGradient(0, 0, 0, 280);
        g.addColorStop(0, `rgba(74,157,111,${intensity})`);
        g.addColorStop(1, `rgba(74,157,111,${intensity * 0.3})`);
        return g;
    });

    _chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Об\'єм, тис. м3',
                    data: volumes,
                    backgroundColor: volGradients,
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: 0.45,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: 'Сер. ціна, грн/м3',
                    data: prices,
                    type: 'line',
                    borderColor: '#E67E22',
                    backgroundColor: 'rgba(230,126,34,.15)',
                    borderWidth: 2.5,
                    pointRadius: 5,
                    pointBackgroundColor: '#E67E22',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 32 } },
            plugins: {
                legend: { display: true, position: 'top', labels: { font: { size: 11 }, usePointStyle: true, padding: 16 } },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,.92)',
                    titleColor: '#fff', bodyColor: '#e5e7eb',
                    borderColor: 'rgba(74,157,111,.4)', borderWidth: 1,
                    cornerRadius: 10, padding: 12
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11, weight: 500 }, color: '#9ca3af', maxRotation: 0 }, border: { display: false } },
                y: {
                    position: 'left',
                    title: { display: true, text: 'тис. м3', font: { size: 10 }, color: '#4A9D6F' },
                    grid: { color: 'rgba(255,255,255,.04)' },
                    ticks: { font: { size: 10 }, color: '#4A9D6F' },
                    border: { display: false }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'грн/м3', font: { size: 10 }, color: '#E67E22' },
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#E67E22' },
                    border: { display: false }
                }
            }
        },
        plugins: [{
            id: 'dualLabels',
            afterDatasetsDraw(chart) {
                const { ctx: c, scales: { x, y, y1 } } = chart;
                const font = 'Inter,system-ui,sans-serif';
                const fN = v => v == null ? '' : v.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
                c.save();

                // Volume labels (above bars)
                const volData = chart.data.datasets[0].data;
                volData.forEach((val, i) => {
                    if (val == null) return;
                    const xP = x.getPixelForValue(i);
                    const yP = y.getPixelForValue(val);
                    c.font = `bold 10px ${font}`;
                    c.fillStyle = '#4A9D6F';
                    c.textAlign = 'center';
                    c.fillText(fN(val), xP, yP - 8);
                });

                // Price labels (next to line points)
                const priceData = chart.data.datasets[1].data;
                priceData.forEach((val, i) => {
                    if (val == null) return;
                    const xP = x.getPixelForValue(i);
                    const yP = y1.getPixelForValue(val);
                    c.font = `bold 10px ${font}`;
                    c.fillStyle = '#E67E22';
                    c.textAlign = 'center';
                    c.fillText(fN(val), xP, yP - 10);
                });

                c.restore();
            }
        }]
    });
}

function drawChart(labels, values, label, type, textLabels) {
    if (_chart) { _chart.destroy(); _chart = null; }

    const canvas = $('infModalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(74,157,111,.3)');
    gradient.addColorStop(1, 'rgba(74,157,111,.02)');

    // Gradient fill for bars — each bar gets unique color intensity
    const barGradients = values.map((v, i) => {
        if (type !== 'bar') return null;
        const intensity = 0.4 + (i / Math.max(values.length - 1, 1)) * 0.4;
        const g = ctx.createLinearGradient(0, 0, 0, 280);
        g.addColorStop(0, `rgba(74,157,111,${intensity})`);
        g.addColorStop(1, `rgba(74,157,111,${intensity * 0.3})`);
        return g;
    });

    _chart = new Chart(ctx, {
        type: type === 'bar' ? 'bar' : 'line',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                borderColor: type === 'bar' ? 'rgba(74,157,111,.8)' : '#4A9D6F',
                backgroundColor: type === 'bar' ? barGradients : gradient,
                borderWidth: type === 'bar' ? 0 : 2,
                borderRadius: type === 'bar' ? 6 : 0,
                fill: type !== 'bar',
                tension: .4,
                pointRadius: type === 'bar' ? 0 : 4,
                pointBackgroundColor: '#4A9D6F',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                barPercentage: 0.65,
                categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 32 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,.92)',
                    titleColor: '#fff',
                    titleFont: { size: 12, weight: 600 },
                    bodyColor: '#e5e7eb',
                    bodyFont: { size: 13 },
                    borderColor: 'rgba(74,157,111,.4)',
                    borderWidth: 1,
                    cornerRadius: 10,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            return v != null ? v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11, weight: 500 }, color: '#9ca3af', maxRotation: 0 },
                    border: { display: false }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,.04)', drawBorder: false },
                    ticks: { font: { size: 10 }, color: '#6b7280', padding: 8 },
                    border: { display: false },
                    grace: '15%'
                }
            }
        },
        plugins: [{
            id: 'deltaLabels',
            afterDatasetsDraw(chart) {
                if (chart.config.type !== 'bar') return;
                const { ctx: c, data, scales: { x, y } } = chart;
                const vals = data.datasets[0]?.data;
                if (!vals) return;
                const font = 'Inter,system-ui,sans-serif';
                const fmtN = v => Math.abs(v) >= 100
                    ? v.toLocaleString('uk-UA', { maximumFractionDigits: 1 })
                    : v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });

                c.save();
                const tLabels = textLabels || [];
                vals.forEach((val, i) => {
                    if (val == null) return;
                    const xP = x.getPixelForValue(i);
                    const yP = y.getPixelForValue(val);
                    const valStr = tLabels[i] || fmtN(val);

                    if (i === 0) {
                        c.font = `bold ${tLabels[i] ? '10' : '12'}px ${font}`;
                        c.fillStyle = '#1F2937';
                        c.textAlign = 'center';
                        c.fillText(valStr, xP, yP - 12);
                    } else {
                        const prev = vals[i - 1];
                        let deltaStr = '', deltaCol = '#9ca3af';
                        if (prev != null && Math.abs(prev) >= 0.01) {
                            const pct = Math.round((val / prev) * 1000) / 10;
                            if (pct !== 100) {
                                deltaStr = ` ${pct}%`;
                                deltaCol = pct > 100 ? '#4ADE80' : '#FB7185';
                            }
                        }
                        const fontSize = tLabels[i] ? 10 : 12;
                        c.font = `bold ${fontSize}px ${font}`;
                        c.fillStyle = '#1F2937';
                        const vW = c.measureText(valStr).width;
                        c.font = `bold ${fontSize - 2}px ${font}`;
                        const dW = deltaStr ? c.measureText(deltaStr).width : 0;
                        const startX = xP - (vW + dW) / 2;

                        c.font = `bold ${fontSize}px ${font}`;
                        c.fillStyle = '#1F2937';
                        c.textAlign = 'left';
                        c.fillText(valStr, startX, yP - 12);
                        if (deltaStr) {
                            c.font = `bold 10px ${font}`;
                            c.fillStyle = deltaCol;
                            c.fillText(deltaStr, startX + vW + 2, yP - 12);
                        }
                    }
                });
                c.restore();
            }
        }]
    });
}
