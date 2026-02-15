// ===== Forest Combined Analytics: Price vs Inventory =====
import { $, fmt, themeColor } from '../utils.js';
import { kill, freshCanvas } from '../charts-common.js';
import { charts } from '../state.js';
import { filteredPrices, filteredInventory } from './state-forest.js';

export function renderCombinedKPIs() {
    const grid = $('kpiGridCombined');
    if (!grid) return;
    if (!filteredPrices.length || !filteredInventory.length) { grid.innerHTML = ''; return; }

    // Find species with high price but low inventory
    const priceBySpecies = {};
    filteredPrices.forEach(r => {
        if (!priceBySpecies[r.species]) priceBySpecies[r.species] = { vol: 0, val: 0 };
        priceBySpecies[r.species].vol += r.volume_m3;
        priceBySpecies[r.species].val += r.total_value_uah;
    });
    const invBySpecies = {};
    filteredInventory.forEach(r => {
        invBySpecies[r.species] = (invBySpecies[r.species] || 0) + r.remaining_volume_m3;
    });

    // High-value + low-inventory species
    const alerts = Object.entries(priceBySpecies)
        .map(([sp, d]) => ({ species: sp, price: d.vol > 0 ? d.val / d.vol : 0, salesVol: d.vol, invVol: invBySpecies[sp] || 0 }))
        .filter(a => a.price > 0 && a.invVol > 0)
        .sort((a, b) => (b.price / (b.invVol + 1)) - (a.price / (a.invVol + 1)));

    const topAlert = alerts[0];
    const totalSalesVol = filteredPrices.reduce((s, r) => s + r.volume_m3, 0);
    const totalInvVol = filteredInventory.reduce((s, r) => s + r.remaining_volume_m3, 0);
    const coverage = totalSalesVol > 0 ? totalInvVol / totalSalesVol : 0;

    const kpis = [
        { label: 'Покриття продажу', val: fmt(coverage, 1), unit: 'x', cls: 'neon-primary', sub: 'Залишки / Продажі' },
        { label: 'Дефіцитна порода', val: topAlert ? topAlert.species : '—', unit: '', cls: 'neon-rose', sub: topAlert ? `Ціна ${fmt(topAlert.price, 0)} грн, зал. ${fmt(topAlert.invVol, 0)} м\u00B3` : '' },
        { label: 'Порід з продажами', val: Object.keys(priceBySpecies).length, unit: '', cls: 'neon-accent', sub: `Порід на складі: ${Object.keys(invBySpecies).length}` },
    ];
    grid.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}

export function renderCorrelationChart() {
    if (!filteredPrices.length || !filteredInventory.length) return;
    kill('correlation');
    const canvas = freshCanvas('wrapCorrelation', 'cCorrelation');
    const ctx = canvas.getContext('2d');

    // Build bubble data: per species - X=price, Y=inventory, size=sales volume
    const priceBySpecies = {};
    filteredPrices.forEach(r => {
        if (!priceBySpecies[r.species]) priceBySpecies[r.species] = { vol: 0, val: 0 };
        priceBySpecies[r.species].vol += r.volume_m3;
        priceBySpecies[r.species].val += r.total_value_uah;
    });
    const invBySpecies = {};
    filteredInventory.forEach(r => {
        invBySpecies[r.species] = (invBySpecies[r.species] || 0) + r.remaining_volume_m3;
    });

    const allSpecies = new Set([...Object.keys(priceBySpecies), ...Object.keys(invBySpecies)]);
    const points = [];
    allSpecies.forEach(sp => {
        const pd = priceBySpecies[sp];
        const inv = invBySpecies[sp] || 0;
        if (!pd || pd.vol <= 0) return;
        const price = pd.val / pd.vol;
        points.push({ x: price, y: inv, r: Math.max(3, Math.min(25, Math.sqrt(pd.vol) / 2)), label: sp });
    });

    charts['correlation'] = new Chart(ctx, {
        type: 'bubble',
        data: { datasets: [{ label: 'Ціна vs Залишок', data: points, backgroundColor: themeColor('--primary') + '60', borderColor: themeColor('--primary'), borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Ціна, грн/м\u00B3', color: themeColor('--text3') }, ticks: { callback: v => fmt(v, 0) } },
                y: { title: { display: true, text: 'Залишок, м\u00B3', color: themeColor('--text3') }, beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } }
            },
            plugins: {
                tooltip: { callbacks: { label: i => {
                    const p = i.raw;
                    return ` ${p.label}: ціна ${fmt(p.x, 0)} грн, залишок ${fmt(p.y, 0)} м\u00B3`;
                } } }
            }
        }
    });
}

export function renderHighValueAlerts() {
    const panel = $('alertsPanel');
    if (!panel) return;
    if (!filteredPrices.length || !filteredInventory.length) { panel.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантажте обидва файли для аналізу</p>'; return; }

    const priceBySpecies = {};
    filteredPrices.forEach(r => {
        if (!priceBySpecies[r.species]) priceBySpecies[r.species] = { vol: 0, val: 0 };
        priceBySpecies[r.species].vol += r.volume_m3;
        priceBySpecies[r.species].val += r.total_value_uah;
    });
    const invBySpecies = {};
    filteredInventory.forEach(r => {
        invBySpecies[r.species] = (invBySpecies[r.species] || 0) + r.remaining_volume_m3;
    });

    const alerts = Object.entries(priceBySpecies)
        .map(([sp, d]) => ({ species: sp, price: d.vol > 0 ? d.val / d.vol : 0, salesVol: d.vol, invVol: invBySpecies[sp] || 0 }))
        .filter(a => a.price > 0)
        .sort((a, b) => b.price - a.price)
        .slice(0, 8);

    panel.innerHTML = alerts.map(a => {
        const ratio = a.salesVol > 0 ? a.invVol / a.salesVol : 999;
        const status = ratio < 0.5 ? 'neon-rose' : ratio < 1.5 ? 'neon-amber' : 'neon-green';
        const statusText = ratio < 0.5 ? 'Дефіцит' : ratio < 1.5 ? 'Увага' : 'Норма';
        return `<div class="glass" style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div><div style="font-size:12px;font-weight:600;color:var(--text)">${a.species}</div>
            <div style="font-size:10px;color:var(--text3)">Ціна: ${fmt(a.price, 0)} грн | Зал: ${fmt(a.invVol, 0)} м\u00B3</div></div>
            <span class="badge ${ratio < 0.5 ? 'down' : ratio < 1.5 ? '' : 'up'}" style="font-size:10px">${statusText}</span>
        </div>`;
    }).join('');
}
