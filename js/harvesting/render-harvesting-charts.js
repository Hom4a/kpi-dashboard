// ===== Harvesting Dashboard Charts =====
import { themeColor, fmt } from '../utils.js';
import { kill, freshCanvas } from '../charts-common.js';
import { charts } from '../state.js';
import { filteredPlanFact, filteredZsu } from './state-harvesting.js';

// 1. Plan vs Actual by region (grouped bar)
export function renderPlanVsActual() {
    if (!filteredPlanFact.length) return;
    kill('planVsActual');
    const canvas = freshCanvas('wrapPlanVsActual', 'cPlanVsActual');
    const ctx = canvas.getContext('2d');
    const sorted = [...filteredPlanFact].sort((a, b) => (b.harvested_total || 0) - (a.harvested_total || 0));
    const labels = sorted.map(r => r.regional_office.replace(/\s*ЛО$/i, ''));
    const pc = themeColor('--primary');
    const sc = themeColor('--secondary') || '#9CAF88';

    charts['planVsActual'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Річний план', data: sorted.map(r => r.annual_plan_total || 0), backgroundColor: pc + '50', borderColor: pc, borderWidth: 1, borderRadius: 4 },
            { label: 'Заготовлено', data: sorted.map(r => r.harvested_total || 0), backgroundColor: sc + '80', borderColor: sc, borderWidth: 1, borderRadius: 4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

// 2. % Execution by region (horizontal bar, sorted)
export function renderExecutionByRegion() {
    if (!filteredPlanFact.length) return;
    kill('executionByRegion');
    const canvas = freshCanvas('wrapExecutionByRegion', 'cExecutionByRegion');
    const ctx = canvas.getContext('2d');
    const sorted = [...filteredPlanFact].map(r => ({
        label: r.regional_office.replace(/\s*ЛО$/i, ''),
        pct: r.pct_annual_total || (r.annual_plan_total > 0 ? r.harvested_total / r.annual_plan_total * 100 : 0)
    })).sort((a, b) => b.pct - a.pct);

    const colors = sorted.map(r => r.pct >= 100 ? 'rgba(34,197,94,0.7)' : r.pct >= 80 ? 'rgba(251,191,36,0.7)' : 'rgba(251,113,133,0.7)');

    charts['executionByRegion'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted.map(r => r.label), datasets: [{ label: '% виконання', data: sorted.map(r => r.pct), backgroundColor: colors, borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 1)}%` } } }
        }
    });
}

// 3. ZSU withdrawals by region (bar)
export function renderZsuByRegion() {
    if (!filteredZsu.length) return;
    kill('zsuByRegion');
    const canvas = freshCanvas('wrapZsuByRegion', 'cZsuByRegion');
    const ctx = canvas.getContext('2d');
    const sorted = [...filteredZsu].map(r => ({
        label: r.regional_office.replace(/\s*ЛО$/i, ''),
        total: (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0)
    })).sort((a, b) => b.total - a.total);

    const pc = themeColor('--primary');
    charts['zsuByRegion'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted.map(r => r.label), datasets: [{ label: 'Відвантажено м\u00B3', data: sorted.map(r => r.total), backgroundColor: pc + '70', borderRadius: 4, barPercentage: 0.7 }] },
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

// 4. Declared vs Shipped for ZSU (grouped bar)
export function renderZsuDeclaredVsShipped() {
    if (!filteredZsu.length) return;
    kill('zsuDeclaredVsShipped');
    const canvas = freshCanvas('wrapZsuDeclVsShip', 'cZsuDeclVsShip');
    const ctx = canvas.getContext('2d');
    const labels = filteredZsu.map(r => r.regional_office.replace(/\s*ЛО$/i, ''));
    const declared = filteredZsu.map(r => (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0));
    const shipped = filteredZsu.map(r => (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0));

    charts['zsuDeclaredVsShipped'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Заявлено', data: declared, backgroundColor: 'rgba(251,191,36,0.6)', borderRadius: 4 },
            { label: 'Відвантажено', data: shipped, backgroundColor: 'rgba(34,197,94,0.6)', borderRadius: 4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

// 5. Product breakdown (doughnut)
export function renderZsuProductBreakdown() {
    if (!filteredZsu.length) return;
    kill('zsuProductBreakdown');
    const canvas = freshCanvas('wrapZsuBreakdown', 'cZsuBreakdown');
    const ctx = canvas.getContext('2d');
    const fpTotal = filteredZsu.reduce((s, r) => s + (r.forest_products_shipped_m3 || 0), 0);
    const lTotal = filteredZsu.reduce((s, r) => s + (r.lumber_shipped_m3 || 0), 0);

    charts['zsuProductBreakdown'] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Лісопродукція', 'Пиломатеріали'], datasets: [{ data: [fpTotal, lTotal], backgroundColor: [themeColor('--primary') + '80', 'rgba(251,191,36,0.7)'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 15 } }, tooltip: { callbacks: { label: i => ` ${i.label}: ${fmt(i.raw, 0)} м\u00B3` } } }
        }
    });
}
