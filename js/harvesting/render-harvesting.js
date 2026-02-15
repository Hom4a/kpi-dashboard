// ===== Harvesting Dashboard Orchestrator =====
import { $ } from '../utils.js';
import { planFactData, zsuData } from './state-harvesting.js';
import { renderHarvestingKPIs } from './render-harvesting-kpis.js';
import { renderPlanVsActual, renderExecutionByRegion, renderZsuByRegion, renderZsuDeclaredVsShipped, renderZsuProductBreakdown } from './render-harvesting-charts.js';
import { renderPlanFactTable, renderZsuTable } from './render-harvesting-table.js';

export function renderHarvestingDashboard() {
    const empty = $('harvestingEmptyState');
    const content = $('harvestingContent');
    if (!planFactData.length && !zsuData.length) {
        if (empty) empty.style.display = '';
        if (content) content.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = '';

    const pfSection = $('planFactSection');
    const zsuSection = $('zsuSection');
    if (pfSection) pfSection.style.display = planFactData.length ? '' : 'none';
    if (zsuSection) zsuSection.style.display = zsuData.length ? '' : 'none';

    const fns = [
        renderHarvestingKPIs,
        renderPlanVsActual, renderExecutionByRegion,
        renderZsuByRegion, renderZsuDeclaredVsShipped, renderZsuProductBreakdown,
        renderPlanFactTable, renderZsuTable
    ];
    for (const fn of fns) { try { fn(); } catch (e) { console.error(fn.name, e); } }
}
