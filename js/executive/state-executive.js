// ===== Executive Dashboard State =====
// Aggregates data from all sources: KPI, Forest, Harvesting
// Supports server-side RPC (get_executive_metrics) with client-side fallback

import { allData, targets } from '../state.js';
import { pricesData, inventoryData } from '../forest/state-forest.js';
import { planFactData, zsuData } from '../harvesting/state-harvesting.js';
import { marketPrices, marketMeta } from '../market/state-market.js';
import { sb } from '../config.js';

export let execCharts = {};
export function setExecCharts(v) { execCharts = v; }

/**
 * Fetch executive metrics from server RPC (fast SQL aggregation).
 * Returns null if RPC is not available (function not deployed).
 */
async function fetchFromRPC() {
    try {
        const { data, error } = await sb.rpc('get_executive_metrics');
        if (error || !data) return null;
        return data;
    } catch (e) {
        return null;
    }
}

/**
 * Transform RPC result into the format expected by render-executive.js.
 * Market comparison and alerts are still computed client-side
 * (market data is small and needs per-species breakdown).
 */
function transformRpcResult(rpc) {
    const pf = rpc.pfSummary || {};
    const zsu = rpc.zsuSummary || {};

    const realizedTotal = rpc.realizedTotal || 0;
    const harvestedTotal = rpc.harvestedTotal || 0;
    const cashTotal = rpc.cashTotal || 0;
    const avgPrice = rpc.avgPrice || 0;
    const inventoryTotal = rpc.inventoryTotal || 0;
    const pfTotal = { annualPlan: pf.annualPlan || 0, harvested: pf.harvested || 0, ninePlan: pf.ninePlan || 0 };
    const pctAnnual = pfTotal.annualPlan > 0 ? (pfTotal.harvested / pfTotal.annualPlan) * 100 : 0;
    const zsuTotalDeclared = zsu.totalDeclared || 0;
    const zsuTotalShipped = zsu.totalShipped || 0;
    const zsuPct = zsuTotalDeclared > 0 ? (zsuTotalShipped / zsuTotalDeclared) * 100 : 0;

    // Coverage days from RPC data
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const daysInYear = Math.max(1, Math.floor((now - yearStart) / 86400000));
    const avgDailyRealized = realizedTotal > 0 ? realizedTotal / daysInYear : 0;
    const coverageDays = avgDailyRealized > 0 ? Math.round(inventoryTotal / avgDailyRealized) : 0;

    // Scorecard from RPC
    const scorecard = (rpc.scorecard || []).map(r => ({
        name: r.name, planPct: r.plan_pct || 0, harvested: r.harvested || 0,
        avgPrice: 0, inventory: 0, zsuPct: r.zsu_pct || 0
    }));

    // Market comparison — still client-side (small data)
    const { marketAvgUa, marketAvgEu, marketDiff, eurRate, marketBySpecies } = computeMarketComparison();

    // Alerts
    const alerts = buildAlerts(scorecard, avgDailyRealized);

    return {
        realizedTotal, harvestedTotal, cashTotal, avgPrice, prevAvgPrice: 0,
        inventoryTotal, coverageDays, zsuTotalShipped, zsuPct,
        pctAnnual, pfTotal,
        realizedSpark: rpc.realizedSpark || [],
        harvestedSpark: rpc.harvestedSpark || [],
        marketAvgUa, marketAvgEu, marketDiff, eurRate, marketBySpecies,
        scorecard, monthlyCash: rpc.monthlyCash || [], alerts,
        targets,
        hasData: rpc.hasKpi || rpc.hasForest || rpc.hasHarvesting || rpc.hasMarket
    };
}

/** Compute market comparison (always client-side — small dataset) */
function computeMarketComparison() {
    const countryRows = marketPrices.filter(r => r.row_type === 'country');
    const avgRow = marketPrices.find(r => r.row_type === 'average');
    const uaRow = countryRows.find(r => (r.country || '').toLowerCase().includes('україна'));
    const avgBiz = (row) => {
        if (!row) return 0;
        const vals = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business].filter(v => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const marketAvgUa = avgBiz(uaRow);
    const marketAvgEu = avgBiz(avgRow);
    const marketDiff = marketAvgEu > 0 ? ((marketAvgUa - marketAvgEu) / marketAvgEu) * 100 : 0;
    const eurRate = marketMeta.eurRate || 0;
    const speciesKeys = [
        { key: 'pine_business', label: 'Сосна' },
        { key: 'spruce_business', label: 'Ялина' },
        { key: 'alder_business', label: 'Вільха' },
        { key: 'birch_business', label: 'Береза' },
        { key: 'oak_business', label: 'Дуб' }
    ];
    const marketBySpecies = speciesKeys.map(f => ({
        label: f.label,
        uaPrice: uaRow ? (uaRow[f.key] || 0) : 0,
        euPrice: avgRow ? (avgRow[f.key] || 0) : 0
    })).filter(d => d.uaPrice > 0 || d.euPrice > 0);
    return { marketAvgUa, marketAvgEu, marketDiff, eurRate, marketBySpecies };
}

/**
 * Compute executive metrics: tries server RPC first, falls back to client-side.
 * @returns {Promise<object>} metrics object
 */
export async function computeExecMetrics() {
    // Try RPC first (fast SQL aggregation ~10ms)
    const rpc = await fetchFromRPC();
    if (rpc) return transformRpcResult(rpc);

    // Fallback: client-side aggregation
    return computeExecMetricsLocal();
}

/** Client-side aggregation (original logic, used as fallback) */
function computeExecMetricsLocal() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // --- KPI aggregation ---
    const ytdRecords = allData.filter(r => r._date >= yearStart);
    const realized = ytdRecords.filter(r => r.type === 'realized');
    const harvested = ytdRecords.filter(r => r.type === 'harvested');
    const cashDaily = ytdRecords.filter(r => r.type === 'cash_daily');
    const cashMonthly = ytdRecords.filter(r => r.type === 'cash_monthly');

    const realizedTotal = realized.reduce((s, r) => s + (r.value || 0), 0);
    const harvestedTotal = harvested.reduce((s, r) => s + (r.value || 0), 0);
    const cashDailyTotal = cashDaily.reduce((s, r) => s + (r.value || 0), 0);
    const cashMonthlyTotal = cashMonthly.reduce((s, r) => s + (r.value || 0), 0);
    const cashTotal = cashMonthlyTotal || cashDailyTotal;

    // Sparkline data (last 30 days)
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const realizedSpark = allData.filter(r => r.type === 'realized' && r._date >= d30)
        .sort((a, b) => a._date - b._date).map(r => r.value);
    const harvestedSpark = allData.filter(r => r.type === 'harvested' && r._date >= d30)
        .sort((a, b) => a._date - b._date).map(r => r.value);

    // --- Forest prices aggregation ---
    const avgPrice = pricesData.length
        ? pricesData.reduce((s, r) => s + (r.weighted_price_uah || 0), 0) / pricesData.length
        : 0;
    const totalVolumeSold = pricesData.reduce((s, r) => s + (r.volume_m3 || 0), 0);

    // Previous period avg price (no historical data in current schema, show 0)
    const prevAvgPrice = 0;

    // --- Forest inventory aggregation ---
    const inventoryTotal = inventoryData.reduce((s, r) => s + (r.remaining_volume_m3 || 0), 0);
    // Coverage days: inventory / average daily realized
    const daysInYear = Math.max(1, Math.floor((now - yearStart) / 86400000));
    const avgDailyRealized = realized.length ? realizedTotal / daysInYear : 0;
    const coverageDays = avgDailyRealized > 0 ? Math.round(inventoryTotal / avgDailyRealized) : 0;

    // --- Harvesting plan-fact ---
    const pfTotal = planFactData.reduce((acc, r) => ({
        annualPlan: acc.annualPlan + (r.annual_plan_total || 0),
        harvested: acc.harvested + (r.harvested_total || 0),
        ninePlan: acc.ninePlan + (r.nine_month_plan_total || 0)
    }), { annualPlan: 0, harvested: 0, ninePlan: 0 });

    const pctAnnual = pfTotal.annualPlan > 0 ? (pfTotal.harvested / pfTotal.annualPlan) * 100 : 0;

    // --- ZSU ---
    const zsuTotalDeclared = zsuData.reduce((s, r) => s + (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0), 0);
    const zsuTotalShipped = zsuData.reduce((s, r) => s + (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0), 0);
    const zsuPct = zsuTotalDeclared > 0 ? (zsuTotalShipped / zsuTotalDeclared) * 100 : 0;

    // --- Market prices aggregation ---
    const countryRows = marketPrices.filter(r => r.row_type === 'country');
    const avgRow = marketPrices.find(r => r.row_type === 'average');
    const uaRow = countryRows.find(r => (r.country || '').toLowerCase().includes('україна'));

    const avgBiz = (row) => {
        if (!row) return 0;
        const vals = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business].filter(v => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const marketAvgUa = avgBiz(uaRow);
    const marketAvgEu = avgBiz(avgRow);
    const marketDiff = marketAvgEu > 0 ? ((marketAvgUa - marketAvgEu) / marketAvgEu) * 100 : 0;
    const eurRate = marketMeta.eurRate || 0;

    // Market by species for executive chart
    const speciesKeys = [
        { key: 'pine_business', label: 'Сосна' },
        { key: 'spruce_business', label: 'Ялина' },
        { key: 'alder_business', label: 'Вільха' },
        { key: 'birch_business', label: 'Береза' },
        { key: 'oak_business', label: 'Дуб' }
    ];
    const marketBySpecies = speciesKeys.map(f => ({
        label: f.label,
        uaPrice: uaRow ? (uaRow[f.key] || 0) : 0,
        euPrice: avgRow ? (avgRow[f.key] || 0) : 0
    })).filter(d => d.uaPrice > 0 || d.euPrice > 0);

    // --- Regional scorecard ---
    const scorecard = buildScorecard();

    // --- Monthly cash for chart ---
    const monthlyCash = buildMonthlyCash();

    // --- Alerts ---
    const alerts = buildAlerts(scorecard, avgDailyRealized);

    return {
        realizedTotal, harvestedTotal, cashTotal, avgPrice, prevAvgPrice,
        inventoryTotal, coverageDays, zsuTotalShipped, zsuPct,
        pctAnnual, pfTotal,
        realizedSpark, harvestedSpark,
        marketAvgUa, marketAvgEu, marketDiff, eurRate, marketBySpecies,
        scorecard, monthlyCash, alerts,
        targets,
        hasData: allData.length > 0 || planFactData.length > 0 || pricesData.length > 0 || marketPrices.length > 0
    };
}

function buildScorecard() {
    // Map regional offices to their data across sources
    const regions = {};

    planFactData.forEach(r => {
        const name = r.regional_office;
        if (!regions[name]) regions[name] = { name, planPct: 0, harvested: 0, avgPrice: 0, inventory: 0, zsuPct: 0 };
        regions[name].planPct = r.annual_plan_total > 0 ? (r.harvested_total / r.annual_plan_total) * 100 : 0;
        regions[name].harvested = r.harvested_total || 0;
    });

    zsuData.forEach(r => {
        const name = r.regional_office;
        if (!regions[name]) regions[name] = { name, planPct: 0, harvested: 0, avgPrice: 0, inventory: 0, zsuPct: 0 };
        const declared = (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0);
        const shipped = (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0);
        regions[name].zsuPct = declared > 0 ? (shipped / declared) * 100 : 0;
    });

    // Sort by worst plan execution
    return Object.values(regions).sort((a, b) => a.planPct - b.planPct);
}

function buildMonthlyCash() {
    const months = {};
    allData.filter(r => r.type === 'cash_daily' || r.type === 'cash_monthly').forEach(r => {
        const key = r.date ? r.date.substring(0, 7) : null; // YYYY-MM
        if (!key) return;
        if (!months[key]) months[key] = 0;
        months[key] += r.value || 0;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total }));
}

function buildAlerts(scorecard, avgDailyRealized) {
    const alerts = [];

    // Regions below 80% plan execution
    scorecard.filter(r => r.planPct > 0 && r.planPct < 80).forEach(r => {
        alerts.push({
            type: 'danger',
            icon: '⚠',
            text: `${r.name}: виконання плану лише ${r.planPct.toFixed(1)}%`
        });
    });

    // ZSU fulfillment issues
    zsuData.forEach(r => {
        const declared = (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0);
        const shipped = (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0);
        if (declared > 0 && shipped / declared < 0.5) {
            alerts.push({
                type: 'warning',
                icon: '🔶',
                text: `ЗСУ ${r.regional_office}: відвантажено лише ${((shipped/declared)*100).toFixed(0)}% від заявленого`
            });
        }
    });

    // Low inventory coverage
    if (avgDailyRealized > 0) {
        const totalInv = inventoryData.reduce((s, r) => s + (r.remaining_volume_m3 || 0), 0);
        const days = totalInv / avgDailyRealized;
        if (days < 30) {
            alerts.push({
                type: 'warning',
                icon: '📦',
                text: `Залишків вистачить на ~${Math.round(days)} днів при поточному темпі реалізації`
            });
        }
    }

    // Market price gap alert
    if (marketPrices.length > 0) {
        const uaR = marketPrices.find(r => (r.country || '').toLowerCase().includes('україна') && r.row_type === 'country');
        const avgR = marketPrices.find(r => r.row_type === 'average');
        if (uaR && avgR) {
            const biz = (row) => {
                const v = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business].filter(x => x > 0);
                return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
            };
            const ua = biz(uaR), eu = biz(avgR);
            if (eu > 0 && ua < eu * 0.8) {
                alerts.push({
                    type: 'warning',
                    icon: '💶',
                    text: `Ціна UA €${ua.toFixed(0)} нижче середньої Європи €${eu.toFixed(0)} на ${(((eu - ua) / eu) * 100).toFixed(0)}%`
                });
            }
        }
    }

    if (alerts.length === 0) {
        alerts.push({ type: 'success', icon: '✓', text: 'Критичних відхилень не виявлено' });
    }

    return alerts;
}
