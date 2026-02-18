// ===== Market Dashboard — Filters =====
import { $ } from '../utils.js';
import { marketPrices, marketUaDetail, marketFilterState, allPeriods,
         setFilteredMarketPrices, setMarketFilterState, setMarketMeta } from './state-market.js';
import { setMarketTableMode } from './render-market-table.js';

let _renderFn = null;
export function setRenderMarketCallback(fn) { _renderFn = fn; }

export function populateMarketFilters() {
    // Period dropdown
    const periodSelect = $('mPeriod');
    if (periodSelect) {
        periodSelect.innerHTML = '<option value="">Останній період</option>' +
            allPeriods.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // Country dropdown (from all data, or filtered by period)
    const countrySelect = $('mCountry');
    if (!countrySelect) return;

    const countries = [...new Set(
        marketPrices.filter(r => r.row_type === 'country').map(r => r.country)
    )].sort();

    countrySelect.innerHTML = '<option value="">Всі країни</option>' +
        countries.map(c => `<option value="${c}">${c}</option>`).join('');
}

export function applyMarketFilter() {
    const { country, period } = marketFilterState;

    // Determine active period
    const activePeriod = period || allPeriods[0] || '';
    let filtered = activePeriod
        ? marketPrices.filter(r => r.period === activePeriod)
        : [...marketPrices];

    // Update meta for the active period
    if (activePeriod && filtered.length) {
        const rec = filtered[0];
        setMarketMeta({ period: rec.period || '', eurRate: rec.eur_rate || 0 });
    }

    if (country) {
        filtered = filtered.filter(r =>
            r.country === country || r.row_type === 'average'
        );
    }

    setFilteredMarketPrices(filtered);
    if (_renderFn) _renderFn();
}

export function initMarketFilterEvents() {
    const periodSelect = $('mPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            setMarketFilterState({ ...marketFilterState, period: periodSelect.value });
            applyMarketFilter();
        });
    }

    const countrySelect = $('mCountry');
    if (countrySelect) {
        countrySelect.addEventListener('change', () => {
            setMarketFilterState({ ...marketFilterState, country: countrySelect.value });
            applyMarketFilter();
        });
    }

    const tgl = $('tglWoodType');
    if (tgl) {
        tgl.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            tgl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setMarketFilterState({ ...marketFilterState, woodType: btn.dataset.w });
            applyMarketFilter();
        });
    }

    const reset = $('marketFilterReset');
    if (reset) {
        reset.addEventListener('click', () => {
            if (periodSelect) periodSelect.value = '';
            if (countrySelect) countrySelect.value = '';
            const tglBtns = $('tglWoodType');
            if (tglBtns) {
                tglBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                tglBtns.querySelector('[data-w="all"]')?.classList.add('active');
            }
            setMarketFilterState({ country: '', woodType: 'all', period: '' });
            applyMarketFilter();
        });
    }

    // Table toggle
    const tblTgl = $('tglMarketTable');
    if (tblTgl) {
        tblTgl.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            tblTgl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setMarketTableMode(btn.dataset.g);
            if (_renderFn) _renderFn();
        });
    }
}
