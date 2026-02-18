// ===== Market Dashboard — Charts =====
import { fmt, themeColor } from '../utils.js';
import { charts, setCharts } from '../state.js';
import { kill, freshCanvas } from '../charts-common.js';
import { filteredMarketPrices, marketUaDetail, marketHistory, marketMeta, marketFilterState, allPeriods } from './state-market.js';

const SPECIES_LABELS = {
    pine_business: 'Сосна', spruce_business: 'Ялина', alder_business: 'Вільха',
    birch_business: 'Береза', oak_business: 'Дуб',
    pine_firewood: 'Сосна (др.)', spruce_firewood: 'Ялина (др.)', birch_firewood: 'Береза (др.)'
};

const SPECIES_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b', '#ec4899'];

const MO_UA = ['', 'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

function fmtMonth(dateStr) {
    const d = new Date(dateStr);
    return MO_UA[d.getMonth() + 1] + ' ' + d.getFullYear().toString().slice(2);
}

// ===== 1. Country Comparison (grouped bar) =====
export function renderCountryComparison() {
    kill('marketCountry');
    const canvas = freshCanvas('wrapMarketCountry', 'cMarketCountry');
    const ctx = canvas.getContext('2d');

    const countries = filteredMarketPrices.filter(r => r.row_type === 'country');
    if (!countries.length) return;

    const labels = countries.map(r => r.country);
    const fields = ['pine_business', 'spruce_business', 'alder_business', 'birch_business', 'oak_business'];
    const datasets = fields.map((f, i) => ({
        label: SPECIES_LABELS[f],
        data: countries.map(r => r[f] || 0),
        backgroundColor: SPECIES_COLORS[i] + '99',
        borderColor: SPECIES_COLORS[i],
        borderWidth: 1, borderRadius: 3
    }));

    charts['marketCountry'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'EUR/м³' },
                     ticks: { callback: v => '€' + v } },
                y: { ticks: { font: { size: 11 } } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: i => ` ${i.dataset.label}: €${fmt(i.parsed.x, 2)}` } }
            }
        }
    });
}

// ===== 2. Ukraine vs Europe (horizontal bar) =====
export function renderUkraineVsEurope() {
    kill('marketUaVsEu');
    const canvas = freshCanvas('wrapMarketUaVsEu', 'cMarketUaVsEu');
    const ctx = canvas.getContext('2d');

    const countries = filteredMarketPrices.filter(r => r.row_type === 'country');
    const ua = countries.find(r => r.country.toLowerCase().startsWith('україна'));
    const avg = filteredMarketPrices.find(r => r.row_type === 'average');
    if (!ua && !avg) return;

    const fields = ['pine_business', 'spruce_business', 'alder_business', 'birch_business', 'oak_business'];
    const labels = fields.map(f => SPECIES_LABELS[f]);

    const pc = themeColor('--primary');
    const ac = themeColor('--amber');

    charts['marketUaVsEu'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Україна', data: fields.map(f => ua ? (ua[f] || 0) : 0), backgroundColor: pc + '99', borderColor: pc, borderWidth: 1, borderRadius: 3 },
                { label: 'Середня Європа', data: fields.map(f => avg ? (avg[f] || 0) : 0), backgroundColor: ac + '99', borderColor: ac, borderWidth: 1, borderRadius: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => '€' + v } },
                y: { ticks: { font: { size: 11 } } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: i => ` ${i.dataset.label}: €${fmt(i.parsed.x, 2)}` } }
            }
        }
    });
}

// ===== 3. Species Ranking (horizontal bar, UA prices) =====
export function renderSpeciesRanking() {
    kill('marketSpecies');
    const canvas = freshCanvas('wrapMarketSpecies', 'cMarketSpecies');
    const ctx = canvas.getContext('2d');

    const ua = filteredMarketPrices.find(r => r.row_type === 'country' && r.country.toLowerCase().startsWith('україна'));
    if (!ua) return;

    const all = Object.entries(SPECIES_LABELS).map(([key, label]) => ({
        label, value: ua[key] || 0,
        isBusiness: key.includes('business')
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    charts['marketSpecies'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: all.map(d => d.label),
            datasets: [{
                data: all.map(d => d.value),
                backgroundColor: all.map(d => d.isBusiness ? '#22c55e80' : '#f59e0b80'),
                borderColor: all.map(d => d.isBusiness ? '#22c55e' : '#f59e0b'),
                borderWidth: 1, borderRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            scales: { x: { beginAtZero: true, ticks: { callback: v => '€' + v } } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: i => ` €${fmt(i.parsed.x, 2)}/м³` } }
            }
        }
    });
}

// ===== 4. Country Time Series (line) =====
export function renderTimeSeries() {
    kill('marketTimeSeries');
    const canvas = freshCanvas('wrapMarketTimeSeries', 'cMarketTimeSeries');
    const ctx = canvas.getContext('2d');

    const countryData = marketHistory.filter(r => r.data_type === 'country_avg');
    if (!countryData.length) return;

    // Unique months sorted
    const months = [...new Set(countryData.map(r => r.month_date))].sort();
    const entities = [...new Set(countryData.map(r => r.entity_name))];

    const datasets = entities.map((name, i) => {
        const byMonth = {};
        countryData.filter(r => r.entity_name === name).forEach(r => { byMonth[r.month_date] = r.price_eur; });
        return {
            label: name,
            data: months.map(m => byMonth[m] || null),
            borderColor: SPECIES_COLORS[i % SPECIES_COLORS.length],
            backgroundColor: SPECIES_COLORS[i % SPECIES_COLORS.length] + '20',
            tension: 0.3, pointRadius: 3, fill: false, spanGaps: true
        };
    });

    charts['marketTimeSeries'] = new Chart(ctx, {
        type: 'line',
        data: { labels: months.map(fmtMonth), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, ticks: { callback: v => '€' + v } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: i => ` ${i.dataset.label}: €${fmt(i.parsed.y, 2)}` } }
            }
        }
    });
}

// ===== 5. Ukrainian Exchange Breakdown (grouped bar) =====
export function renderUaExchangeBreakdown() {
    kill('marketExchange');
    const canvas = freshCanvas('wrapMarketExchange', 'cMarketExchange');
    const ctx = canvas.getContext('2d');

    const exchanges = ['УЕБ', 'УУБ', 'УРБ'];
    const activePeriod = marketFilterState.period || allPeriods[0] || '';
    const periodUa = activePeriod ? marketUaDetail.filter(r => r.period === activePeriod) : marketUaDetail;
    const data = periodUa.filter(r => exchanges.includes(r.exchange) && r.avg_price_uah > 0);
    if (!data.length) return;

    const species = [...new Set(data.map(r => r.species))];
    const colors = ['#3b82f6', '#22c55e', '#f59e0b'];

    const datasets = exchanges.map((ex, i) => {
        const bySpecies = {};
        data.filter(r => r.exchange === ex).forEach(r => { bySpecies[r.species] = r.avg_price_uah; });
        return {
            label: ex,
            data: species.map(s => bySpecies[s] || 0),
            backgroundColor: colors[i] + '99',
            borderColor: colors[i],
            borderWidth: 1, borderRadius: 3
        };
    });

    charts['marketExchange'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: species, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) + ' грн' } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} грн/м³` } }
            }
        }
    });
}

// ===== 6. Price Dynamics by Species, Ukraine (line) =====
export function renderPriceDynamics() {
    kill('marketDynamics');
    const canvas = freshCanvas('wrapMarketDynamics', 'cMarketDynamics');
    const ctx = canvas.getContext('2d');

    const speciesData = marketHistory.filter(r => r.data_type === 'ua_species');
    if (!speciesData.length) return;

    const months = [...new Set(speciesData.map(r => r.month_date))].sort();
    const entities = [...new Set(speciesData.map(r => r.entity_name))];

    const datasets = entities.map((name, i) => {
        const byMonth = {};
        speciesData.filter(r => r.entity_name === name).forEach(r => { byMonth[r.month_date] = r.price_eur; });
        return {
            label: name,
            data: months.map(m => byMonth[m] || null),
            borderColor: SPECIES_COLORS[i % SPECIES_COLORS.length],
            tension: 0.3, pointRadius: 3, fill: false, spanGaps: true
        };
    });

    charts['marketDynamics'] = new Chart(ctx, {
        type: 'line',
        data: { labels: months.map(fmtMonth), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, ticks: { callback: v => '€' + v } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: i => ` ${i.dataset.label}: €${fmt(i.parsed.y, 2)}` } }
            }
        }
    });
}
