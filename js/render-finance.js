// ===== Finance Page Rendering =====
import { $, fmt, themeColor } from './utils.js';
import { filtered, allData, charts, MO } from './state.js';
import { kill, freshCanvas, makeGrad, getTargetAnnotation } from './charts-common.js';
import { buildTableRows } from './render-volumes.js';

export function renderFinKPIs() {
    const cashD = filtered.filter(r => r.type === 'cash_daily');
    const cashM = filtered.filter(r => r.type === 'cash_monthly');
    if (!cashD.length && !cashM.length) { $('kpiGridFin').innerHTML = ''; return; }
    const sumD = cashD.reduce((s, r) => s + r.value, 0);
    const sumM = cashM.reduce((s, r) => s + r.value, 0);
    const avgD = cashD.length ? sumD / cashD.length : 0;
    const maxD = cashD.length ? Math.max(...cashD.map(r => r.value)) : 0;
    const kpis = [
        { label: 'Гроші (дні)', val: fmt(sumD / 1e6, 2), unit: 'млн грн', cls: 'neon-primary', sub: 'Денна динаміка' },
        { label: 'Гроші (міс)', val: fmt(sumM / 1e6, 2), unit: 'млн грн', cls: 'neon-secondary', sub: 'Помісячна агрегація' },
        { label: 'Середнє/день', val: fmt(avgD / 1e3, 1), unit: 'тис грн', cls: 'neon-accent', sub: 'Грошові надходження' },
        { label: 'Макс за день', val: fmt(maxD / 1e3, 1), unit: 'тис грн', cls: 'neon-amber' },
    ];
    $('kpiGridFin').innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}

export function renderCashChart() {
    const cashD = filtered.filter(r => r.type === 'cash_daily');
    const cashM = filtered.filter(r => r.type === 'cash_monthly');
    if (!cashD.length && !cashM.length) return;
    kill('cash');
    const canvas = freshCanvas('wrapCash', 'cCash');
    const ctx = canvas.getContext('2d');
    const ds = [];
    if (cashD.length) ds.push({ label: 'Денна динаміка', data: cashD.map(r => ({ x: r._date, y: r.value })), borderColor: themeColor('--amber'), backgroundColor: makeGrad(ctx, 251, 191, 36), borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: true, tension: 0.3 });
    if (cashM.length) ds.push({ label: 'Помісячна агрегація', data: cashM.map(r => ({ x: r._date, y: r.value })), borderColor: themeColor('--green'), backgroundColor: makeGrad(ctx, 34, 197, 94), borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, fill: true, tension: 0.2, pointBackgroundColor: themeColor('--green') });
    const annotation = getTargetAnnotation('cash_daily', 'План грн/день');
    charts['cash'] = new Chart(ctx, {
        type: 'line', data: { datasets: ds },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yyyy' }}, ticks: { maxTicksLimit: 15 }},
                y: { beginAtZero: true, ticks: { callback: v => v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? (v/1e3|0) + 'k' : v }}},
            plugins: { annotation, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} грн` }}}
        }
    });
}

export function renderFinTable() {
    const data = allData.filter(r => r.type === 'cash_daily').sort((a, b) => a._date - b._date);
    $('tblBodyFin').innerHTML = buildTableRows(data, true);
}
