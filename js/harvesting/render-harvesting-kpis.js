// ===== Harvesting KPI Cards =====
import { $, fmt } from '../utils.js';
import { filteredPlanFact, filteredZsu } from './state-harvesting.js';

export function renderHarvestingKPIs() {
    const grid = $('kpiGridHarvesting');
    if (!grid) return;
    if (!filteredPlanFact.length && !filteredZsu.length) { grid.innerHTML = ''; return; }

    const totalAnnualPlan = filteredPlanFact.reduce((s, r) => s + (r.annual_plan_total || 0), 0);
    const totalHarvested = filteredPlanFact.reduce((s, r) => s + (r.harvested_total || 0), 0);
    const pctAnnual = totalAnnualPlan > 0 ? (totalHarvested / totalAnnualPlan * 100) : 0;
    const totalNineMonthPlan = filteredPlanFact.reduce((s, r) => s + (r.nine_month_plan_total || 0), 0);
    const pct9Month = totalNineMonthPlan > 0 ? (totalHarvested / totalNineMonthPlan * 100) : 0;

    const totalZsu = filteredZsu.reduce((s, r) => s + (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0), 0);

    let bestRegion = '', bestPct = 0;
    filteredPlanFact.forEach(r => {
        const pct = r.pct_annual_total || (r.annual_plan_total > 0 ? r.harvested_total / r.annual_plan_total * 100 : 0);
        if (pct > bestPct) { bestPct = pct; bestRegion = r.regional_office; }
    });

    const kpis = [
        { label: 'Річний план', val: fmt(totalAnnualPlan / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', sub: 'Загальний обсяг' },
        { label: 'Заготовлено', val: fmt(totalHarvested / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-secondary', sub: 'З початку року' },
        { label: '% від річного', val: fmt(pctAnnual, 1), unit: '%', cls: 'neon-accent', sub: 'Виконання річного плану' },
        { label: '% від 9-міс', val: fmt(pct9Month, 1), unit: '%', cls: 'neon-amber', sub: 'Виконання 9-міс плану' },
        { label: 'Для ЗСУ', val: fmt(totalZsu, 0), unit: 'м\u00B3', cls: 'neon-green', sub: 'Відвантажено' },
        { label: 'Найкращий регіон', val: fmt(bestPct, 1) + '%', unit: '', cls: 'neon-rose', sub: bestRegion || '—' },
    ];
    grid.innerHTML = kpis.map(k => `
        <div class="glass kpi-card ${k.cls}"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}<span class="kpi-unit">${k.unit}</span></div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}
