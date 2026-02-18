// ===== Market Dashboard — KPI Cards =====
import { $, fmt } from '../utils.js';
import { marketPrices, marketMeta } from './state-market.js';

export function renderMarketKPIs() {
    const grid = $('kpiGridMarket');
    if (!grid) return;

    const countries = marketPrices.filter(r => r.row_type === 'country');
    const ua = countries.find(r => r.country.toLowerCase().startsWith('україна'));
    const avg = marketPrices.find(r => r.row_type === 'average');
    const rate = marketMeta.eurRate || 1;

    // UA average business price
    const uaBusiness = ua ? avgBusiness(ua) : 0;
    const uaUah = uaBusiness * rate;

    // EU average
    const euBusiness = avg ? avgBusiness(avg) : 0;

    // Difference %
    const diff = euBusiness > 0 ? ((uaBusiness - euBusiness) / euBusiness * 100) : 0;
    const diffSign = diff >= 0 ? '+' : '';
    const diffColor = diff >= 0 ? 'var(--green)' : 'var(--rose)';

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
            <div class="kpi-sub">${marketMeta.period || '—'}</div>
        </div>
    `;
}

function avgBusiness(row) {
    const vals = [row.pine_business, row.spruce_business, row.alder_business, row.birch_business, row.oak_business]
        .filter(v => v != null && v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}
