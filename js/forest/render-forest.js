// ===== Forest Dashboard Orchestrator =====
import { $ } from '../utils.js';
import { pricesData, inventoryData } from './state-forest.js';
import { renderPriceKPIs, renderInventoryKPIs } from './render-forest-kpis.js';
import { renderPricesByProduct, renderPricesBySpecies, renderPricesByRegion, renderVolumesByWarehouse, renderInventoryByBranch, renderInventoryByProduct, renderInventoryBySpecies, renderInventoryByWoodGroup } from './render-forest-charts.js';
import { renderPricesTable, renderInventoryTable } from './render-forest-table.js';
import { renderCombinedKPIs, renderCorrelationChart, renderHighValueAlerts } from './render-forest-combined.js';

export function renderForestDashboard() {
    // Show/hide empty state
    const empty = $('forestEmptyState');
    const content = $('forestContent');
    if (!pricesData.length && !inventoryData.length) {
        if (empty) empty.style.display = '';
        if (content) content.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = '';

    // Show/hide price and inventory sections
    const pricesSection = $('pricesSection');
    const invSection = $('inventorySection');
    const combinedSection = $('combinedSection');
    if (pricesSection) pricesSection.style.display = pricesData.length ? '' : 'none';
    if (invSection) invSection.style.display = inventoryData.length ? '' : 'none';
    if (combinedSection) combinedSection.style.display = (pricesData.length && inventoryData.length) ? '' : 'none';

    const fns = [
        renderPriceKPIs, renderInventoryKPIs,
        renderPricesByProduct, renderPricesBySpecies, renderPricesByRegion, renderVolumesByWarehouse,
        renderInventoryByBranch, renderInventoryByProduct, renderInventoryBySpecies, renderInventoryByWoodGroup,
        renderPricesTable, renderInventoryTable,
        renderCombinedKPIs, renderCorrelationChart, renderHighValueAlerts
    ];
    for (const fn of fns) { try { fn(); } catch (e) { console.error(fn.name, e); } }
}
