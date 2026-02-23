// ===== GIS Summary Dashboard: KPIs, Alerts, Comparison Chart =====
import { $, fmt } from '../utils.js';
import { charts } from '../state.js';
import { kill, freshCanvas } from '../charts-common.js';
import { getRegionColor } from './gis-controls.js';

export function renderGisSummary(metrics) {
    renderSummaryKpis(metrics);
    renderAlerts(metrics);
    renderComparisonChart(metrics);
}

function renderSummaryKpis(metrics) {
    const el = $('gisSummaryKpis');
    if (!el) return;

    const all = Object.values(metrics);
    const totalHarvested = all.reduce((s, m) => s + m.harvested, 0);
    const totalAnnualPlan = all.reduce((s, m) => s + m.annualPlan, 0);
    const avgPlanPct = totalAnnualPlan > 0 ? (totalHarvested / totalAnnualPlan) * 100 : 0;
    const totalInventory = all.reduce((s, m) => s + m.inventory, 0);
    const totalVolume = all.reduce((s, m) => s + m.totalVolume, 0);
    const totalValue = all.reduce((s, m) => s + m.totalValue, 0);
    const overallAvgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
    const withPlan = all.filter(m => m.annualPlan > 0);
    const worstRegion = withPlan.sort((a, b) => a.planPct - b.planPct)[0];
    const bestRegion = [...withPlan].sort((a, b) => b.planPct - a.planPct)[0];

    const hasAnyData = totalHarvested > 0 || totalInventory > 0 || totalVolume > 0;
    if (!hasAnyData) { el.innerHTML = ''; return; }

    const kpis = [
        { label: 'Виконання плану', val: avgPlanPct > 0 ? avgPlanPct.toFixed(1) + '%' : '\u2014', cls: 'neon-primary',
          sub: totalAnnualPlan > 0 ? `${fmt(totalHarvested / 1000, 1)} / ${fmt(totalAnnualPlan / 1000, 1)} \u0442\u0438\u0441.\u043C\u00B3` : '' },
        { label: 'Середня ціна', val: overallAvgPrice > 0 ? fmt(overallAvgPrice, 0) : '\u2014', cls: 'neon-secondary',
          sub: overallAvgPrice > 0 ? `${fmt(totalVolume / 1000, 1)} \u0442\u0438\u0441.\u043C\u00B3 реалізовано` : '' },
        { label: 'Залишки', val: totalInventory > 0 ? fmt(totalInventory / 1000, 1) : '\u2014', cls: 'neon-accent',
          sub: totalInventory > 0 ? '\u0442\u0438\u0441.\u043C\u00B3 \u0432\u0441\u0456 \u0440\u0435\u0433\u0456\u043E\u043D\u0438' : '' },
        { label: 'Найгірший', val: worstRegion ? worstRegion.planPct.toFixed(1) + '%' : '\u2014', cls: 'neon-rose',
          sub: worstRegion ? worstRegion.name : '' },
        { label: 'Найкращий', val: bestRegion ? bestRegion.planPct.toFixed(1) + '%' : '\u2014', cls: 'neon-green',
          sub: bestRegion ? bestRegion.name : '' }
    ];

    el.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.val}</div>
            ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
        </div>
    `).join('');
}

function renderAlerts(metrics) {
    const el = $('gisAlerts');
    if (!el) return;

    const alerts = [];
    Object.values(metrics).forEach(m => {
        if (m.annualPlan > 0 && m.planPct < 80) {
            alerts.push({ type: 'danger', text: `${m.name}: ${m.planPct.toFixed(1)}% \u043F\u043B\u0430\u043D\u0443` });
        }
        if (m.zsuDeclared > 0 && m.zsuPct < 50) {
            alerts.push({ type: 'warning', text: `\u0417\u0421\u0423 ${m.name}: ${m.zsuPct.toFixed(0)}%` });
        }
        if (m.inventory > 0 && m.avgPrice > 0 && m.avgPrice < 1000) {
            alerts.push({ type: 'warning', text: `${m.name}: ціна ${fmt(m.avgPrice, 0)} грн/м\u00B3` });
        }
    });
    if (!alerts.length) alerts.push({ type: 'success', text: 'Критичних відхилень немає' });

    el.innerHTML = alerts.slice(0, 8).map(a => {
        const color = a.type === 'danger' ? '#fb7185' : a.type === 'warning' ? '#fbbf24' : '#22c55e';
        return `<div style="font-size:11px;padding:6px 10px;border-radius:8px;background:rgba(${a.type === 'danger' ? '251,113,133' : a.type === 'warning' ? '251,191,36' : '34,197,94'},0.1);color:${color};border:1px solid ${color}22">${a.text}</div>`;
    }).join('');
}

function renderComparisonChart(metrics) {
    const wrapEl = $('wrapGisComparison');
    if (!wrapEl) return;

    kill('cGisComparison');
    const all = Object.values(metrics).filter(m => m.annualPlan > 0).sort((a, b) => b.planPct - a.planPct);
    if (!all.length) {
        wrapEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:20px;font-size:12px">Немає даних заготівлі</p>';
        return;
    }

    const canvas = freshCanvas('wrapGisComparison', 'cGisComparison');
    const ctx = canvas.getContext('2d');
    const labels = all.map(m => m.name.replace(' ЛО', ''));
    const data = all.map(m => m.planPct);
    const colors = all.map(m => getRegionColor(m.planPct));

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.map(c => c + '88'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: i => ` ${i.parsed.x.toFixed(1)}%` }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: Math.max(120, ...data.map(d => d + 10)),
                    ticks: { callback: v => v + '%', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: { font: { size: 10 }, color: 'rgba(255,255,255,0.6)' },
                    grid: { display: false }
                }
            }
        }
    });
    charts['cGisComparison'] = chart;
}
