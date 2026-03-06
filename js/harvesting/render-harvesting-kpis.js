// ===== Harvesting KPI Cards =====
import { $, fmt } from '../utils.js';
import { filteredPlanFact, filteredZsu } from './state-harvesting.js';
import { kpiCard, initCollapsible, ICONS } from '../ui-helpers.js';

export function renderHarvestingKPIs() {
    const grid = $('kpiGridHarvesting');
    if (!grid) return;
    if (!filteredPlanFact.length && !filteredZsu.length) { grid.innerHTML = ''; return; }

    initCollapsible('#pageHarvesting');

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

    grid.innerHTML = [
        kpiCard({ label: 'Річний план', value: fmt(totalAnnualPlan / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.target, sub: 'Загальний обсяг' }),
        kpiCard({ label: 'Заготовлено', value: fmt(totalHarvested / 1000, 1), unit: 'тис м\u00B3', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.checkCircle, sub: 'З початку року' }),
        kpiCard({ label: '% від річного', value: fmt(pctAnnual, 1), unit: '%', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.pieChart, sub: 'Виконання річного плану' }),
        kpiCard({ label: '% від 9-міс', value: fmt(pct9Month, 1), unit: '%', cls: 'neon-amber', icClass: 'ic-amber', icon: ICONS.clock, sub: 'Виконання 9-міс плану' }),
        kpiCard({ label: 'Для ЗСУ', value: fmt(totalZsu, 0), unit: 'м\u00B3', cls: 'neon-green', icClass: 'ic-green', icon: ICONS.shield, sub: 'Відвантажено' }),
        kpiCard({ label: 'Найкращий регіон', value: fmt(bestPct, 1) + '%', unit: '', cls: 'neon-rose', icClass: 'ic-rose', icon: ICONS.award, sub: bestRegion || '\u2014' }),
    ].join('');
}
