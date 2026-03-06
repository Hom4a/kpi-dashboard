// ===== Forest Dashboard KPI Cards =====
import { $, fmt } from '../utils.js';
import { filteredPrices, filteredInventory } from './state-forest.js';
import { marketPrices, marketMeta } from '../market/state-market.js';
import { kpiCard, initCollapsible, ICONS } from '../ui-helpers.js';

export function renderPriceKPIs() {
    const grid = $('kpiGridPrices');
    if (!grid) return;
    if (!filteredPrices.length) { grid.innerHTML = ''; return; }

    initCollapsible('#pageForest');

    const totalVol = filteredPrices.reduce((s, r) => s + r.volume_m3, 0);
    const totalVal = filteredPrices.reduce((s, r) => s + r.total_value_uah, 0);
    const avgPrice = totalVol > 0 ? totalVal / totalVol : 0;
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
    let marketCardHtml = '';
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
            marketCardHtml = kpiCard({
                label: 'Ціна vs Ринок', value: `€${fmt(ua, 0)}`, unit: '',
                cls: diff >= 0 ? 'neon-green' : 'neon-rose',
                icClass: diff >= 0 ? 'ic-green' : 'ic-rose',
                icon: ICONS.globe, change: diff,
                sub: `EU сер. €${fmt(eu, 0)}` + (rate > 0 ? ` · ${fmt(ua * rate, 0)} грн` : '')
            });
        }
    }

    grid.innerHTML = [
        kpiCard({ label: 'Загальний обсяг', value: fmt(totalVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.package, sub: `${filteredPrices.length} позицій` }),
        kpiCard({ label: 'Середня ціна', value: fmt(avgPrice, 0), unit: 'грн/м\u00B3', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.tag, sub: 'Середньозважена' }),
        kpiCard({ label: 'Загальна вартість', value: fmt(totalVal / 1e6, 2), unit: 'млн грн', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.dollar, sub: 'Сума всіх продажів' }),
        kpiCard({ label: 'Найвища ціна', value: fmt(maxPrice, 0), unit: 'грн/м\u00B3', cls: 'neon-amber', icClass: 'ic-amber', icon: ICONS.trendUp, sub: maxPriceSpecies || '' }),
        marketCardHtml,
    ].filter(Boolean).join('');
}

export function renderInventoryKPIs() {
    const grid = $('kpiGridInventory');
    if (!grid) return;
    if (!filteredInventory.length) { grid.innerHTML = ''; return; }

    const totalVol = filteredInventory.reduce((s, r) => s + r.remaining_volume_m3, 0);
    const posCount = filteredInventory.length;
    const speciesSet = new Set(filteredInventory.map(r => r.species).filter(Boolean));

    const byBranch = {};
    filteredInventory.forEach(r => {
        byBranch[r.branch] = (byBranch[r.branch] || 0) + r.remaining_volume_m3;
    });
    let maxBranch = '', maxBranchVol = 0;
    Object.entries(byBranch).forEach(([br, vol]) => {
        if (vol > maxBranchVol) { maxBranchVol = vol; maxBranch = br; }
    });

    grid.innerHTML = [
        kpiCard({ label: 'Загальні залишки', value: fmt(totalVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.database, sub: 'Всі склади' }),
        kpiCard({ label: 'Кількість позицій', value: fmt(posCount), unit: '', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.list, sub: 'Унікальних записів' }),
        kpiCard({ label: 'Найбільший залишок', value: fmt(maxBranchVol / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.arrowUp, sub: maxBranch }),
        kpiCard({ label: 'Кількість порід', value: fmt(speciesSet.size), unit: '', cls: 'neon-green', icClass: 'ic-green', icon: ICONS.layers, sub: 'Унікальних порід' }),
    ].join('');
}
