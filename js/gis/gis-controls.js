// ===== GIS Map Controls: Legend, Colors, Region Drill-Down =====
import { $, fmt } from '../utils.js';
import { charts } from '../state.js';
import { kill, freshCanvas } from '../charts-common.js';
import { pricesData, inventoryData } from '../forest/state-forest.js';
import { getBranchToOffice, fuzzyMatchBranch } from './gis-data.js';
import { setSelectedRegion } from './state-gis.js';

export function getRegionColor(pctPlan) {
    if (pctPlan >= 90) return '#22c55e';
    if (pctPlan >= 70) return '#fbbf24';
    return '#fb7185';
}

export function renderLegend(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:var(--text2)">
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#22c55e;margin-right:4px;vertical-align:middle"></span>&gt;90%</span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#fbbf24;margin-right:4px;vertical-align:middle"></span>70-90%</span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#fb7185;margin-right:4px;vertical-align:middle"></span>&lt;70%</span>
        </div>
    `;
}

export function renderRegionDetail(containerId, regionData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!regionData) {
        el.style.display = 'none';
        setSelectedRegion(null);
        return;
    }

    el.style.display = '';
    setSelectedRegion(regionData.name);

    // Title
    const titleEl = $('gisDrillTitle');
    if (titleEl) titleEl.textContent = regionData.name;
    const oblastsEl = $('gisDrillOblasts');
    if (oblastsEl) oblastsEl.textContent = (regionData.oblasts || []).join(', ');

    // KPI cards
    renderDrillKpis(regionData);

    // Charts
    renderDrillPriceChart(regionData);
    renderDrillInventoryChart(regionData);

    // Detail table
    renderDrillTable(regionData);
}

export function closeGisDrilldown() {
    const el = $('gisRegionDetail');
    if (el) el.style.display = 'none';
    const ph = $('gisRegionPlaceholder');
    if (ph) ph.style.display = '';
    setSelectedRegion(null);
}

function renderDrillKpis(m) {
    const el = $('gisDrillKpis');
    if (!el) return;

    const kpis = [
        { label: 'Виконання плану', val: m.annualPlan > 0 ? m.planPct.toFixed(1) + '%' : '\u2014', cls: 'neon-primary',
          sub: m.annualPlan > 0 ? `${fmt(m.harvested / 1000, 1)} / ${fmt(m.annualPlan / 1000, 1)} тис.м\u00B3` : 'Немає даних' },
        { label: 'Середня ціна', val: m.avgPrice > 0 ? fmt(m.avgPrice, 0) + ' грн/м\u00B3' : '\u2014', cls: 'neon-secondary',
          sub: m.priceRecords > 0 ? `${m.priceRecords} записів` : 'Немає даних цін' },
        { label: 'Залишки', val: m.inventory > 0 ? fmt(m.inventory / 1000, 1) + ' тис.м\u00B3' : '\u2014', cls: 'neon-accent',
          sub: m.inventoryRecords > 0 ? `${m.inventoryRecords} позицій` : 'Немає даних' },
        { label: 'ЗСУ виконання', val: m.zsuDeclared > 0 ? m.zsuPct.toFixed(0) + '%' : '\u2014', cls: 'neon-rose',
          sub: m.zsuDeclared > 0 ? `${fmt(m.zsuShipped, 0)} / ${fmt(m.zsuDeclared, 0)} м\u00B3` : 'Немає даних' }
    ];

    el.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.val}</div>
            ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
        </div>
    `).join('');
}

function getRegionPrices(officeName) {
    const branchMap = getBranchToOffice();
    return pricesData.filter(r => {
        const mapped = branchMap[r.branch] || fuzzyMatchBranch(r.branch);
        return mapped === officeName;
    });
}

function getRegionInventory(officeName) {
    const branchMap = getBranchToOffice();
    return inventoryData.filter(r => {
        const mapped = branchMap[r.branch] || fuzzyMatchBranch(r.branch);
        return mapped === officeName;
    });
}

function renderDrillPriceChart(regionData) {
    const wrapEl = $('wrapGisDrillPrice');
    if (!wrapEl) return;

    kill('cGisDrillPrice');
    const regionPrices = getRegionPrices(regionData.name);
    if (!regionPrices.length) {
        wrapEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px;font-size:12px">Немає даних цін для цього регіону</p>';
        return;
    }

    // Aggregate by species
    const bySpecies = {};
    regionPrices.forEach(r => {
        const sp = r.species || 'Інше';
        if (!bySpecies[sp]) bySpecies[sp] = { vol: 0, val: 0 };
        bySpecies[sp].vol += r.volume_m3 || 0;
        bySpecies[sp].val += r.total_value_uah || 0;
    });
    const entries = Object.entries(bySpecies)
        .map(([species, d]) => ({ species, avgPrice: d.vol > 0 ? d.val / d.vol : 0 }))
        .filter(e => e.avgPrice > 0)
        .sort((a, b) => b.avgPrice - a.avgPrice)
        .slice(0, 10);

    if (!entries.length) {
        wrapEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px;font-size:12px">Немає даних цін</p>';
        return;
    }

    const canvas = freshCanvas('wrapGisDrillPrice', 'cGisDrillPrice');
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(e => e.species),
            datasets: [{
                label: 'грн/м\u00B3',
                data: entries.map(e => e.avgPrice),
                backgroundColor: 'rgba(74,157,111,0.5)',
                borderColor: '#4A9D6F',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 0)} грн/м\u00B3` } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => fmt(v, 0), font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { font: { size: 10 }, color: 'rgba(255,255,255,0.6)' }, grid: { display: false } }
            }
        }
    });
    charts['cGisDrillPrice'] = chart;
}

function renderDrillInventoryChart(regionData) {
    const wrapEl = $('wrapGisDrillInv');
    if (!wrapEl) return;

    kill('cGisDrillInv');
    const regionInv = getRegionInventory(regionData.name);
    if (!regionInv.length) {
        wrapEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px;font-size:12px">Немає даних залишків для цього регіону</p>';
        return;
    }

    // Aggregate by species
    const bySpecies = {};
    regionInv.forEach(r => {
        const sp = r.species || 'Інше';
        if (!bySpecies[sp]) bySpecies[sp] = 0;
        bySpecies[sp] += r.remaining_volume_m3 || 0;
    });
    const entries = Object.entries(bySpecies)
        .map(([species, vol]) => ({ species, vol }))
        .filter(e => e.vol > 0)
        .sort((a, b) => b.vol - a.vol)
        .slice(0, 10);

    if (!entries.length) {
        wrapEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px;font-size:12px">Немає даних залишків</p>';
        return;
    }

    const canvas = freshCanvas('wrapGisDrillInv', 'cGisDrillInv');
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(e => e.species),
            datasets: [{
                label: 'тис.м\u00B3',
                data: entries.map(e => e.vol / 1000),
                backgroundColor: 'rgba(99,179,237,0.5)',
                borderColor: '#63b3ed',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 1)} тис.м\u00B3` } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => fmt(v, 1), font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { font: { size: 10 }, color: 'rgba(255,255,255,0.6)' }, grid: { display: false } }
            }
        }
    });
    charts['cGisDrillInv'] = chart;
}

function renderDrillTable(regionData) {
    const el = $('gisDrillTable');
    if (!el) return;

    const regionPrices = getRegionPrices(regionData.name);
    const regionInv = getRegionInventory(regionData.name);

    if (!regionPrices.length && !regionInv.length) {
        el.innerHTML = '<p style="padding:16px;color:var(--text3);font-size:12px">Немає детальних даних для цього регіону</p>';
        return;
    }

    // Aggregate by product
    const byProduct = {};
    regionPrices.forEach(r => {
        const key = r.product || 'Інше';
        if (!byProduct[key]) byProduct[key] = { product: key, vol: 0, val: 0, inv: 0 };
        byProduct[key].vol += r.volume_m3 || 0;
        byProduct[key].val += r.total_value_uah || 0;
    });
    regionInv.forEach(r => {
        const key = r.product || r.product_name || 'Інше';
        if (!byProduct[key]) byProduct[key] = { product: key, vol: 0, val: 0, inv: 0 };
        byProduct[key].inv += r.remaining_volume_m3 || 0;
    });

    const rows = Object.values(byProduct)
        .sort((a, b) => (b.vol + b.inv) - (a.vol + a.inv))
        .slice(0, 15);

    el.innerHTML = `
        <table class="tbl" style="width:100%">
            <thead>
                <tr>
                    <th>Продукція</th>
                    <th style="text-align:right">Реалізація, м\u00B3</th>
                    <th style="text-align:right">Сер. ціна, грн</th>
                    <th style="text-align:right">Залишки, м\u00B3</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td>${r.product}</td>
                        <td style="text-align:right">${r.vol > 0 ? fmt(r.vol, 1) : '\u2014'}</td>
                        <td style="text-align:right">${r.vol > 0 ? fmt(r.val / r.vol, 0) : '\u2014'}</td>
                        <td style="text-align:right">${r.inv > 0 ? fmt(r.inv, 1) : '\u2014'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
