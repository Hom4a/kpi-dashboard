// ===== Market Dashboard — KPI Cards =====
import { $, fmt } from '../utils.js';
import { marketPrices, marketMeta, allPeriods, marketFilterState } from './state-market.js';

export function renderMarketKPIs() {
    const grid = $('kpiGridMarket');
    if (!grid) return;

    const activePeriod = marketFilterState.period || allPeriods[0] || '';
    const curPrices = activePeriod
        ? marketPrices.filter(r => r.period === activePeriod)
        : marketPrices;

    const countries = curPrices.filter(r => r.row_type === 'country');
    const ua = countries.find(r => r.country.toLowerCase().startsWith('україна'));
    const avg = curPrices.find(r => r.row_type === 'average');
    const rate = marketMeta.eurRate || 1;

    const uaBusiness = ua ? avgBusiness(ua) : 0;
    const uaUah = uaBusiness * rate;
    const euBusiness = avg ? avgBusiness(avg) : 0;
    const diff = euBusiness > 0 ? ((uaBusiness - euBusiness) / euBusiness * 100) : 0;
    const diffSign = diff >= 0 ? '+' : '';
    const diffColor = diff >= 0 ? 'var(--green)' : 'var(--rose)';

    // Previous period comparison
    const prevPeriod = findPrevPeriod(activePeriod);
    let deltaHtml = '';
    if (prevPeriod) {
        const prevPrices = marketPrices.filter(r => r.period === prevPeriod);
        const prevUa = prevPrices.find(r => r.row_type === 'country' && r.country.toLowerCase().startsWith('україна'));
        const prevEu = prevPrices.find(r => r.row_type === 'average');
        const prevUaVal = prevUa ? avgBusiness(prevUa) : 0;
        const prevEuVal = prevEu ? avgBusiness(prevEu) : 0;

        const uaDelta = prevUaVal > 0 ? ((uaBusiness - prevUaVal) / prevUaVal * 100) : 0;
        const euDelta = prevEuVal > 0 ? ((euBusiness - prevEuVal) / prevEuVal * 100) : 0;

        deltaHtml = `
            <div class="kpi-card glass">
                <div class="kpi-label">Зміна vs ${prevPeriod}</div>
                <div style="display:flex;gap:16px;align-items:center;margin-top:8px">
                    <div style="text-align:center">
                        <div style="font-size:10px;color:var(--text3)">UA</div>
                        <div class="kpi-value" style="font-size:18px;color:${uaDelta >= 0 ? 'var(--green)' : 'var(--rose)'}">
                            ${uaDelta >= 0 ? '▲' : '▼'} ${Math.abs(uaDelta).toFixed(1)}%
                        </div>
                        <div style="font-size:10px;color:var(--text3)">€${fmt(prevUaVal, 1)} → €${fmt(uaBusiness, 1)}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:10px;color:var(--text3)">EU сер.</div>
                        <div class="kpi-value" style="font-size:18px;color:${euDelta >= 0 ? 'var(--green)' : 'var(--rose)'}">
                            ${euDelta >= 0 ? '▲' : '▼'} ${Math.abs(euDelta).toFixed(1)}%
                        </div>
                        <div style="font-size:10px;color:var(--text3)">€${fmt(prevEuVal, 1)} → €${fmt(euBusiness, 1)}</div>
                    </div>
                </div>
            </div>`;
    }

    grid.innerHTML = `
        <div class="kpi-card glass">
            <div class="kpi-label">Ціна Україна (ділова)</div>
            <div class="kpi-value" style="color:var(--primary)">€${fmt(uaBusiness, 1)}</div>
            <div class="kpi-sub">≈ ${fmt(uaUah, 0)} грн/м³</div>
        </div>
        <div class="kpi-card glass">
            <div class="kpi-label">Середня Європа (ділова)</div>
            <div class="kpi-value" style="color:var(--text)">€${fmt(euBusiness, 1)}</div>
            <div class="kpi-sub">≈ ${fmt(euBusiness * rate, 0)} грн/м³</div>
        </div>
        <div class="kpi-card glass">
            <div class="kpi-label">Різниця UA vs EU</div>
            <div class="kpi-value" style="color:${diffColor}">${diffSign}${fmt(diff, 1)}%</div>
            <div class="kpi-sub">${diff < 0 ? 'Нижче ринку' : 'Вище ринку'}</div>
        </div>
        <div class="kpi-card glass">
            <div class="kpi-label">Курс EUR</div>
            <div class="kpi-value" style="color:var(--amber)">₴${fmt(rate, 2)}</div>
            <div class="kpi-sub">${activePeriod || '—'}</div>
        </div>
        ${deltaHtml}
    `;
}

function avgBusiness(row) {
    const vals = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business]
        .filter(v => v != null && v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function findPrevPeriod(current) {
    if (!current || allPeriods.length < 2) return null;
    const idx = allPeriods.indexOf(current);
    if (idx < 0) return allPeriods.length >= 2 ? allPeriods[1] : null;
    return idx + 1 < allPeriods.length ? allPeriods[idx + 1] : null;
}
