// ===== Market Dashboard — Render Orchestrator =====
import { $, show, hide } from '../utils.js';
import { marketPrices } from './state-market.js';
import { renderMarketKPIs } from './render-market-kpis.js';
import { renderCountryComparison, renderUkraineVsEurope, renderSpeciesRanking,
         renderTimeSeries, renderUaExchangeBreakdown, renderPriceDynamics } from './render-market-charts.js';
import { renderMarketTable } from './render-market-table.js';

export function renderMarketDashboard() {
    const empty = $('marketEmptyState');
    const content = $('marketContent');
    if (!empty || !content) return;

    if (!marketPrices.length) {
        empty.style.display = '';
        content.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    content.style.display = '';

    try { renderMarketKPIs(); } catch(e) { console.error('Market KPIs error:', e); }
    try { renderCountryComparison(); } catch(e) { console.error('Market country chart error:', e); }
    try { renderUkraineVsEurope(); } catch(e) { console.error('Market UA vs EU error:', e); }
    try { renderSpeciesRanking(); } catch(e) { console.error('Market species ranking error:', e); }
    try { renderTimeSeries(); } catch(e) { console.error('Market time series error:', e); }
    try { renderUaExchangeBreakdown(); } catch(e) { console.error('Market exchange error:', e); }
    try { renderPriceDynamics(); } catch(e) { console.error('Market dynamics error:', e); }
    try { renderMarketTable(); } catch(e) { console.error('Market table error:', e); }
}
