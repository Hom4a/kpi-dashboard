// ===== Market Dashboard — KPI Cards =====
import { $, fmt } from '../utils.js';
import { marketPrices, marketMeta, allPeriods, marketFilterState } from './state-market.js';
import { kpiCard, ICONS } from '../ui-helpers.js';

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

    // Data date
    const dateSub = $('marketDataDate');
    if (dateSub) dateSub.textContent = activePeriod ? `Період: ${activePeriod}` : '';

    // Previous period comparison
    const prevPeriod = findPrevPeriod(activePeriod);
    let deltaCardHtml = '';
    if (prevPeriod) {
        const prevPrices = marketPrices.filter(r => r.period === prevPeriod);
        const prevUa = prevPrices.find(r => r.row_type === 'country' && r.country.toLowerCase().startsWith('україна'));
        const prevUaVal = prevUa ? avgBusiness(prevUa) : 0;
        const uaDelta = prevUaVal > 0 ? ((uaBusiness - prevUaVal) / prevUaVal * 100) : 0;

        deltaCardHtml = kpiCard({
            label: `Зміна vs ${prevPeriod}`, value: `${uaDelta >= 0 ? '+' : ''}${fmt(uaDelta, 1)}%`, unit: '',
            cls: uaDelta >= 0 ? 'neon-green' : 'neon-rose',
            icClass: uaDelta >= 0 ? 'ic-green' : 'ic-rose',
            icon: ICONS.trendUp, change: null,
            sub: `€${fmt(prevUaVal, 1)} \u2192 €${fmt(uaBusiness, 1)}`
        });
    }

    grid.innerHTML = [
        kpiCard({ label: 'Ціна Україна (ділова)', value: `€${fmt(uaBusiness, 1)}`, unit: '', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.tag, sub: `\u2248 ${fmt(uaUah, 0)} грн/м\u00B3` }),
        kpiCard({ label: 'Середня ціна ЄС (ділова)', value: `€${fmt(euBusiness, 1)}`, unit: '', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.globe, sub: `\u2248 ${fmt(euBusiness * rate, 0)} грн/м\u00B3` }),
        kpiCard({ label: 'Різниця UA vs EU', value: `${diff >= 0 ? '+' : ''}${fmt(diff, 1)}%`, unit: '', cls: diff >= 0 ? 'neon-green' : 'neon-rose', icClass: diff >= 0 ? 'ic-green' : 'ic-rose', icon: ICONS.chartLine, sub: diff < 0 ? 'Нижче ринку' : 'Вище ринку' }),
        kpiCard({ label: 'Курс EUR', value: `\u20B4${fmt(rate, 2)}`, unit: '', cls: 'neon-amber', icClass: 'ic-amber', icon: ICONS.dollar, sub: marketMeta.nbuRate ? `НБУ: \u20B4${fmt(marketMeta.nbuRate, 2)}` : (activePeriod || '\u2014') }),
        deltaCardHtml,
    ].filter(Boolean).join('');
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
