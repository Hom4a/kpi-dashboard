// ===== Forest Dashboard KPI Cards =====
import { $, fmt } from '../utils.js';
import { filteredPrices, filteredInventory } from './state-forest.js';
import { marketPrices, marketMeta } from '../market/state-market.js';

export function renderPriceKPIs() {
    const grid = $('kpiGridPrices');
    if (!grid) return;
    if (!filteredPrices.length) { grid.innerHTML = ''; return; }

    const totalVol = filteredPrices.reduce((s, r) => s + r.volume_m3, 0);
    const totalVal = filteredPrices.reduce((s, r) => s + r.total_value_uah, 0);
    const avgPrice = totalVol > 0 ? totalVal / totalVol : 0;
    // Find highest price species
    const bySpecies = {};
    filteredPrices.forEach(r => {
        if (!bySpecies[r.species]) bySpecies[r.species] = { vol: 0, val: 0 };
        bySpecies[r.species].vol += r.volume_m3;
        bySpecies[r.species].val += r.total_value_uah;
    });
    let maxPriceSpecies = '', maxPrice = 0;
    Object.entries(bySpecies).forEach(([sp, d]) => {
        const p = d.vol > 0 ? d.val / d.vol : 0;
        if (p > maxPrice) { maxPrice = p; maxPriceSpecies = sp; }
    });

    // Market benchmark
    let marketCard = null;
    if (marketPrices.length > 0) {
        const uaRow = marketPrices.find(r => (r.country || '').toLowerCase().includes('україна') && r.row_type === 'country');
        const avgRow = marketPrices.find(r => r.row_type === 'average');
        if (uaRow && avgRow) {
            const biz = (row) => {
                const v = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business].filter(x => x > 0);
                return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
            };
            const ua = biz(uaRow), eu = biz(avgRow);
            const diff = eu > 0 ? ((ua - eu) / eu * 100) : 0;
            const rate = marketMeta.eurRate || 0;
            marketCard = {
                label: 'Ціна vs Ринок', val: `€${fmt(ua, 0)}`, unit: '',
                cls: diff >= 0 ? 'neon-green' : 'neon-rose',
                change: diff,
                sub: `EU сер. €${fmt(eu, 0)}` + (rate > 0 ? ` · ${fmt(ua * rate, 0)} грн` : '')
            };
        }
    }

    const kpis = [
        { label: 'Загальний обсяг', val: fmt(totalVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', sub: `${filteredPrices.length} позицій` },
        { label: 'Середня ціна', val: fmt(avgPrice, 0), unit: 'грн/м\u00B3', cls: 'neon-secondary', sub: 'Середньозважена' },
        { label: 'Загальна вартість', val: fmt(totalVal / 1e6, 2), unit: 'млн грн', cls: 'neon-accent', sub: 'Сума всіх продажів' },
        { label: 'Найвища ціна', val: fmt(maxPrice, 0), unit: 'грн/м\u00B3', cls: 'neon-amber', sub: maxPriceSpecies || '' },
    ];
    if (marketCard) kpis.push(marketCard);
    grid.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
        ${k.change != null ? `<div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(k.change).toFixed(1)}%</div>` : ''}
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}

export function renderInventoryKPIs() {
    const grid = $('kpiGridInventory');
    if (!grid) return;
    if (!filteredInventory.length) { grid.innerHTML = ''; return; }

    const totalVol = filteredInventory.reduce((s, r) => s + r.remaining_volume_m3, 0);
    const posCount = filteredInventory.length;
    const speciesSet = new Set(filteredInventory.map(r => r.species).filter(Boolean));

    // Find branch with largest inventory
    const byBranch = {};
    filteredInventory.forEach(r => {
        byBranch[r.branch] = (byBranch[r.branch] || 0) + r.remaining_volume_m3;
    });
    let maxBranch = '', maxBranchVol = 0;
    Object.entries(byBranch).forEach(([br, vol]) => {
        if (vol > maxBranchVol) { maxBranchVol = vol; maxBranch = br; }
    });

    const kpis = [
        { label: 'Загальні залишки', val: fmt(totalVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', sub: 'Всі склади' },
        { label: 'Кількість позицій', val: fmt(posCount), unit: '', cls: 'neon-secondary', sub: 'Унікальних записів' },
        { label: 'Найбільший залишок', val: fmt(maxBranchVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-accent', sub: maxBranch },
        { label: 'Кількість порід', val: fmt(speciesSet.size), unit: '', cls: 'neon-green', sub: 'Унікальних порід' },
    ];
    grid.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}
