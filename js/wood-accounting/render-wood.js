// ===== Wood Accounting Dashboard Renderer =====
import { $, fmtDate } from '../utils.js';
import { kpiCard, ICONS, initCollapsible } from '../ui-helpers.js';
import { receptionData, salesData } from './state-wood.js';

function fmtNum(v, decimals = 0) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('uk-UA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

let chartInstance = null;

export function renderWoodDashboard() {
    const hasData = receptionData.length > 0 || salesData.length > 0;
    const emptyEl = $('woodEmptyState');
    const contentEl = $('woodContent');
    if (emptyEl) emptyEl.style.display = hasData ? 'none' : '';
    if (contentEl) contentEl.style.display = hasData ? '' : 'none';

    if (!hasData) return;

    renderKpis();
    renderReceptionTable();
    renderSalesTable();
    renderChart();
    initCollapsible('#pageWoodAccounting');
    updateDataDate();
}

function updateDataDate() {
    const el = $('woodDataDate');
    if (!el) return;
    // Show latest period from data
    const latestRec = receptionData[0];
    const latestSales = salesData[0];
    const parts = [];
    if (latestRec) parts.push(`Приймання: ${fmtDate(latestRec.period_start)} — ${fmtDate(latestRec.period_end)}`);
    if (latestSales) parts.push(`Реалізація: ${fmtDate(latestSales.period_start)} — ${fmtDate(latestSales.period_end)}`);
    el.textContent = parts.join(' | ') || 'Дані не завантажено';
}

function renderKpis() {
    const grid = $('woodKpiGrid');
    if (!grid) return;

    // Get latest period data
    const latestPeriodRec = getLatestPeriod(receptionData);
    const latestPeriodSales = getLatestPeriod(salesData);

    const totalReception = latestPeriodRec.reduce((s, r) => s + (r.total_m3 || 0), 0);
    const totalSalesVol = latestPeriodSales.reduce((s, r) => s + (r.volume_m3 || 0), 0);
    const totalAmount = latestPeriodSales.reduce((s, r) => s + (r.amount_excl_vat || 0), 0);
    const avgPrice = totalSalesVol > 0 ? totalAmount / totalSalesVol : 0;

    grid.innerHTML = `<div class="kpi-grid-inner">
        ${kpiCard({ label: 'Приймання', value: fmtNum(totalReception, 0), unit: ' м\u00B3', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.package })}
        ${kpiCard({ label: 'Реалізація', value: fmtNum(totalSalesVol, 0), unit: ' м\u00B3', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.truck })}
        ${kpiCard({ label: 'Середня ціна', value: fmtNum(avgPrice, 2), unit: ' грн/м\u00B3', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.tag })}
        ${kpiCard({ label: 'Виручка', value: fmtNum(totalAmount / 1e6, 1), unit: ' млн грн', cls: 'neon-rose', icClass: 'ic-rose', icon: ICONS.banknote })}
    </div>`;
}

function renderReceptionTable() {
    const container = $('woodReceptionTable');
    if (!container) return;

    const rows = getLatestPeriod(receptionData);
    if (!rows.length) { container.innerHTML = '<p class="empty-msg">Дані приймання не завантажено</p>'; return; }

    const totals = { np: 0, pv: 0, lt: 0, rt: 0, total: 0 };
    const trs = rows.map(r => {
        totals.np += r.firewood_np_m3 || 0;
        totals.pv += r.firewood_pv_m3 || 0;
        totals.lt += r.long_timber_m3 || 0;
        totals.rt += r.round_timber_m3 || 0;
        totals.total += r.total_m3 || 0;
        return `<tr>
            <td>${r.regional_office}</td>
            <td class="r">${fmtNum(r.firewood_np_m3, 1)}</td>
            <td class="r">${fmtNum(r.firewood_pv_m3, 1)}</td>
            <td class="r">${fmtNum(r.long_timber_m3, 1)}</td>
            <td class="r">${fmtNum(r.round_timber_m3, 1)}</td>
            <td class="r"><strong>${fmtNum(r.total_m3, 1)}</strong></td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="tbl">
        <thead><tr>
            <th>Філія</th><th class="r">Дров'яна НП</th><th class="r">Дров'яна ПВ</th>
            <th class="r">Довгомірні</th><th class="r">Круглі</th><th class="r">Разом</th>
        </tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr class="total-row">
            <td><strong>Разом</strong></td>
            <td class="r"><strong>${fmtNum(totals.np, 1)}</strong></td>
            <td class="r"><strong>${fmtNum(totals.pv, 1)}</strong></td>
            <td class="r"><strong>${fmtNum(totals.lt, 1)}</strong></td>
            <td class="r"><strong>${fmtNum(totals.rt, 1)}</strong></td>
            <td class="r"><strong>${fmtNum(totals.total, 1)}</strong></td>
        </tr></tfoot>
    </table>`;
}

function renderSalesTable() {
    const container = $('woodSalesTable');
    if (!container) return;

    const rows = getLatestPeriod(salesData);
    if (!rows.length) { container.innerHTML = '<p class="empty-msg">Дані реалізації не завантажено</p>'; return; }

    const totals = { vol: 0, amount: 0 };
    const trs = rows.map(r => {
        totals.vol += r.volume_m3 || 0;
        totals.amount += r.amount_excl_vat || 0;
        return `<tr>
            <td>${r.regional_office}</td>
            <td class="r">${fmtNum(r.volume_m3, 1)}</td>
            <td class="r">${fmtNum(r.avg_price_uah, 2)}</td>
            <td class="r">${fmtNum(r.amount_excl_vat, 0)}</td>
        </tr>`;
    }).join('');

    const avgPrice = totals.vol > 0 ? totals.amount / totals.vol : 0;

    container.innerHTML = `<table class="tbl">
        <thead><tr>
            <th>Філія</th><th class="r">Об'єм, м\u00B3</th><th class="r">Ціна, грн</th><th class="r">Сума без ПДВ, грн</th>
        </tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr class="total-row">
            <td><strong>Разом</strong></td>
            <td class="r"><strong>${fmtNum(totals.vol, 1)}</strong></td>
            <td class="r"><strong>${fmtNum(avgPrice, 2)}</strong></td>
            <td class="r"><strong>${fmtNum(totals.amount, 0)}</strong></td>
        </tr></tfoot>
    </table>`;
}

function renderChart() {
    const canvas = $('woodChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const rows = getLatestPeriod(salesData);
    if (!rows.length) return;

    const labels = rows.map(r => r.regional_office.replace(' ЛО', ''));
    const volumes = rows.map(r => r.volume_m3 || 0);
    const amounts = rows.map(r => (r.amount_excl_vat || 0) / 1e6);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: "Об'єм, тис.м\u00B3",
                    data: volumes.map(v => v / 1000),
                    backgroundColor: 'rgba(74, 157, 111, 0.7)',
                    borderColor: 'rgba(74, 157, 111, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Виручка, млн грн',
                    data: amounts,
                    backgroundColor: 'rgba(251, 113, 133, 0.7)',
                    borderColor: 'rgba(251, 113, 133, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#b0b8c8', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#8892a4', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { position: 'left', title: { display: true, text: "тис.м\u00B3", color: '#8892a4' }, ticks: { color: '#8892a4' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { position: 'right', title: { display: true, text: 'млн грн', color: '#8892a4' }, ticks: { color: '#8892a4' }, grid: { display: false } }
            }
        }
    });
}

// Get rows for the latest (most recent) period
function getLatestPeriod(data) {
    if (!data.length) return [];
    const latest = data[0]; // already sorted by period_end DESC
    return data.filter(r => r.period_start === latest.period_start && r.period_end === latest.period_end);
}
