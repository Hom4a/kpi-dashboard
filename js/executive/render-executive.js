// ===== Executive Dashboard Rendering =====
import { $, fmt, show, hide, themeColor } from '../utils.js';
import { MO } from '../state.js';
import { kill, freshCanvas, makeGrad, drawSparkline } from '../charts-common.js';
import { computeExecMetrics, execCharts, setExecCharts } from './state-executive.js';

export function renderExecutiveDashboard() {
    const m = computeExecMetrics();

    if (!m.hasData) {
        show('execEmptyState');
        hide('execContent');
        return;
    }
    hide('execEmptyState');
    $('execContent').style.display = '';

    renderExecKPIs(m);
    renderScorecard(m.scorecard);
    renderCumulativeChart(m);
    renderCashChart(m.monthlyCash);
    renderAlerts(m.alerts);
    renderBubbleChart(m);
    renderStackedChart(m);
}

function renderExecKPIs(m) {
    const kpis = [
        {
            label: 'Реалізація YTD', val: fmt(m.realizedTotal / 1000, 1), unit: 'тис.м\u00B3',
            cls: 'neon-primary',
            sub: m.pctAnnual > 0 ? `${m.pctAnnual.toFixed(1)}% від річного плану` : 'Немає даних плану',
            spark: m.realizedSpark, sparkColor: themeColor('--primary')
        },
        {
            label: 'Заготівля YTD', val: fmt(m.harvestedTotal / 1000, 1), unit: 'тис.м\u00B3',
            cls: 'neon-secondary',
            sub: `Всього за рік`,
            spark: m.harvestedSpark, sparkColor: themeColor('--secondary')
        },
        {
            label: 'Надходження YTD', val: fmt(m.cashTotal / 1000000, 1), unit: 'млн грн',
            cls: 'neon-amber', sub: 'Грошові кошти'
        },
        {
            label: 'Середня ціна', val: fmt(m.avgPrice, 0), unit: 'грн/м\u00B3',
            cls: 'neon-accent',
            change: m.prevAvgPrice > 0 ? ((m.avgPrice - m.prevAvgPrice) / m.prevAvgPrice * 100) : null,
            sub: m.marketAvgUa > 0
                ? `Євр: €${fmt(m.marketAvgUa, 0)} (${m.marketDiff >= 0 ? '+' : ''}${m.marketDiff.toFixed(0)}% vs EU)`
                : 'Середньозважена'
        },
        {
            label: 'Залишки', val: fmt(m.inventoryTotal / 1000, 1), unit: 'тис.м\u00B3',
            cls: 'neon-green',
            sub: m.coverageDays > 0 ? `Покриття: ~${m.coverageDays} днів` : 'Немає даних обсягів'
        },
        {
            label: 'ЗСУ відвантажено', val: fmt(m.zsuTotalShipped, 0), unit: 'м\u00B3',
            cls: 'neon-rose',
            sub: m.zsuPct > 0 ? `${m.zsuPct.toFixed(0)}% від заявленого` : 'Немає даних'
        },
    ];

    $('kpiGridExec').innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-row">
                <div><div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
                ${k.change != null ? `<div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(k.change).toFixed(1)}%</div>` : ''}
                ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>
                ${k.spark ? `<div class="sparkline-wrap"><canvas width="80" height="30" data-spark="${k.sparkColor || ''}"></canvas></div>` : ''}
            </div>
        </div>`).join('');

    // Draw sparklines
    const canvases = document.querySelectorAll('#kpiGridExec .sparkline-wrap canvas');
    canvases.forEach((c, i) => {
        const data = kpis[i].spark;
        if (data && data.length) drawSparkline(c, data, c.dataset.spark || themeColor('--primary'));
    });
}

function renderScorecard(scorecard) {
    const tbody = $('tblBodyScorecard');
    if (!scorecard.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }

    tbody.innerHTML = scorecard.map(r => {
        const planCls = r.planPct >= 100 ? 'badge-green' : r.planPct >= 80 ? 'badge-amber' : 'badge-red';
        const zsuCls = r.zsuPct >= 80 ? 'badge-green' : r.zsuPct >= 50 ? 'badge-amber' : r.zsuPct > 0 ? 'badge-red' : '';
        return `<tr>
            <td><b>${r.name}</b></td>
            <td><span class="exec-badge ${planCls}">${r.planPct.toFixed(1)}%</span></td>
            <td>${fmt(r.harvested / 1000, 1)} тис</td>
            <td>${r.avgPrice > 0 ? fmt(r.avgPrice, 0) : '—'}</td>
            <td>${r.inventory > 0 ? fmt(r.inventory / 1000, 1) + ' тис' : '—'}</td>
            <td>${r.zsuPct > 0 ? `<span class="exec-badge ${zsuCls}">${r.zsuPct.toFixed(0)}%</span>` : '—'}</td>
        </tr>`;
    }).join('');
}

function renderCumulativeChart(m) {
    kill('cExecCum');
    const canvas = freshCanvas('wrapExecCum', 'cExecCum');
    const ctx = canvas.getContext('2d');

    // Build cumulative realized by day-of-year
    const now = new Date();
    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);

    // Import allData through metrics
    const { realizedTotal } = m;
    // We need the raw data — use allData from import chain
    // Since we can't import allData directly here (it's in state), use m
    // Build from sparkline approach: cumulative sum
    // Actually use the metrics approach — for simplicity build monthly sums

    const monthlyData = {};
    // We'll recompute from the state imports in state-executive
    // For now, show target line vs monthly bar as cumulative
    const target = m.targets && m.targets.monthly_realized ? m.targets.monthly_realized : 0;

    if (m.monthlyCash.length === 0 && m.realizedTotal === 0) {
        $('wrapExecCum').innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px">Немає даних</p>';
        return;
    }

    // Simple placeholder chart — cumulative realized
    const labels = MO.slice(0, now.getMonth() + 1);
    const cumData = labels.map(() => 0); // Will be filled when we have monthly breakdown

    const ch = { execCharts };
    const c = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Реалізація (кумулятивно)',
                data: cumData.length ? cumData : [m.realizedTotal / 1000],
                borderColor: themeColor('--primary'),
                backgroundColor: makeGrad(ctx, 74, 157, 111),
                fill: true, tension: 0.3
            }]
        },
        options: {
            plugins: { legend: { display: true } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) + ' тис' } }
            }
        }
    });
    const ec = execCharts; ec.cExecCum = c; setExecCharts(ec);
}

function renderCashChart(monthlyCash) {
    kill('cExecCash');
    const canvas = freshCanvas('wrapExecCash', 'cExecCash');
    const ctx = canvas.getContext('2d');

    if (!monthlyCash.length) {
        $('wrapExecCash').innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px">Немає фінансових даних</p>';
        return;
    }

    const labels = monthlyCash.map(m => {
        const [y, mo] = m.month.split('-');
        return MO[parseInt(mo) - 1] + ' ' + y.slice(2);
    });
    const values = monthlyCash.map(m => m.total / 1000000);

    const c = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Надходження, млн грн',
                data: values,
                backgroundColor: themeColor('--amber') || 'rgba(245,166,35,0.7)',
                borderRadius: 6
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => fmt(v, 1) + ' млн' } }
            }
        }
    });
    const ec = execCharts; ec.cExecCash = c; setExecCharts(ec);
}

function renderAlerts(alerts) {
    const el = $('execAlerts');
    el.innerHTML = alerts.map(a => {
        const cls = a.type === 'danger' ? 'exec-alert-danger' : a.type === 'warning' ? 'exec-alert-warning' : 'exec-alert-success';
        return `<div class="exec-alert ${cls}"><span class="exec-alert-icon">${a.icon}</span><span>${a.text}</span></div>`;
    }).join('');
}

function renderBubbleChart(m) {
    kill('cExecBubble');
    const canvas = freshCanvas('wrapExecBubble', 'cExecBubble');
    const ctx = canvas.getContext('2d');

    if (!m.scorecard.length) {
        $('wrapExecBubble').innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px">Немає даних</p>';
        return;
    }

    const bubbles = m.scorecard.filter(r => r.harvested > 0).map(r => ({
        x: r.planPct,
        y: r.harvested / 1000,
        r: Math.max(5, Math.min(25, (r.inventory || 1) / 500)),
        label: r.name
    }));

    const c = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Регіони',
                data: bubbles,
                backgroundColor: bubbles.map(b =>
                    b.x >= 100 ? 'rgba(74,157,111,0.6)' : b.x >= 80 ? 'rgba(245,166,35,0.6)' : 'rgba(231,76,60,0.6)'
                ),
                borderColor: 'rgba(255,255,255,0.2)'
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const b = bubbles[ctx.dataIndex];
                            return `${b.label}: ${b.x.toFixed(1)}% плану, ${fmt(b.y, 1)} тис.м³`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: '% виконання плану' } },
                y: { title: { display: true, text: 'Заготовлено, тис.м³' }, beginAtZero: true }
            }
        }
    });
    const ec = execCharts; ec.cExecBubble = c; setExecCharts(ec);
}

function renderStackedChart(m) {
    kill('cExecStacked');
    const canvas = freshCanvas('wrapExecStacked', 'cExecStacked');
    const ctx = canvas.getContext('2d');

    // Group forest prices by region and product
    // This requires pricesData — import through state
    // For now, show a placeholder or use scorecard data
    if (!m.scorecard.length) {
        $('wrapExecStacked').innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px">Немає даних</p>';
        return;
    }

    const labels = m.scorecard.map(r => r.name.replace(' ЛО', ''));
    const harvestedData = m.scorecard.map(r => r.harvested / 1000);

    const c = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Заготовлено, тис.м³',
                data: harvestedData,
                backgroundColor: themeColor('--primary') || 'rgba(74,157,111,0.7)',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) } }
            }
        }
    });
    const ec = execCharts; ec.cExecStacked = c; setExecCharts(ec);
}
