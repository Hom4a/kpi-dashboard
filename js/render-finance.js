// ===== Finance Page Rendering =====
import { $, fmt, fmtDate, themeColor } from './utils.js';
import { filtered, allData, charts, MO } from './state.js';
import { kill, freshCanvas, makeGrad, getTargetAnnotation } from './charts-common.js';
import { buildTableRows } from './render-volumes.js';
import { kpiCard, drawEnhancedSparkline, ICONS } from './ui-helpers.js';

export function renderFinKPIs() {
    const cashD = filtered.filter(r => r.type === 'cash_daily');
    const cashM = filtered.filter(r => r.type === 'cash_monthly');
    if (!cashD.length && !cashM.length) { $('kpiGridFin').innerHTML = ''; return; }
    const sumD = cashD.reduce((s, r) => s + r.value, 0);
    const sumM = cashM.reduce((s, r) => s + r.value, 0);
    const avgD = cashD.length ? sumD / cashD.length : 0;
    const maxD = cashD.length ? Math.max(...cashD.map(r => r.value)) : 0;
    const last30 = cashD.slice(-30).map(r => r.value);

    // Data date
    const dateSub = $('finDataDate');
    if (dateSub && cashD.length) dateSub.textContent = `Дані за ${fmtDate(cashD[cashD.length - 1].date)}`;

    $('kpiGridFin').innerHTML = [
        kpiCard({ label: 'Гроші (дні)', value: fmt(sumD / 1e6, 2), unit: 'млн грн', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.banknote, sub: 'Денна динаміка', sparkId: 'finSpk0' }),
        kpiCard({ label: 'Гроші (міс)', value: fmt(sumM / 1e6, 2), unit: 'млн грн', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.creditCard, sub: 'Помісячна агрегація' }),
        kpiCard({ label: 'Середнє/день', value: fmt(avgD / 1e3, 1), unit: 'тис грн', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.trendUp, sub: 'Грошові надходження' }),
        kpiCard({ label: 'Макс за день', value: fmt(maxD / 1e3, 1), unit: 'тис грн', cls: 'neon-amber', icClass: 'ic-amber', icon: ICONS.zap }),
    ].join('');

    // Draw sparkline
    const spk0 = document.querySelector('[data-spark-id="finSpk0"]');
    if (spk0 && last30.length) drawEnhancedSparkline(spk0, last30, themeColor('--primary'));
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
