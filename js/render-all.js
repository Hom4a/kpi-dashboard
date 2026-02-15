// ===== Render All Orchestrator =====
import { charts } from './state.js';
import { setupChartDefaults } from './charts-common.js';
import { renderKPIs, renderInsights, renderMainChart, renderMonthlyChart, renderCumChart, renderYoyChart, renderWdChart, renderTable } from './render-volumes.js';
import { renderFinKPIs, renderCashChart, renderFinTable } from './render-finance.js';
import { renderForestDashboard } from './forest/render-forest.js';
import { renderHarvestingDashboard } from './harvesting/render-harvesting.js';

export function renderAll() {
    setupChartDefaults();
    const fns = [renderKPIs, renderInsights, renderMainChart, renderCashChart, renderMonthlyChart, renderCumChart, renderYoyChart, renderWdChart, renderTable, renderFinKPIs, renderFinTable, renderForestDashboard, renderHarvestingDashboard];
    for (const fn of fns) { try { fn(); } catch (e) { console.error(fn.name, e); } }
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => { Object.values(charts).forEach(c => { try { c.resize(); } catch(e){} }); });
}
