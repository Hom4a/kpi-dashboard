// ===== Market Dashboard — Filters =====
import { $ } from '../utils.js';
import { marketPrices, marketFilterState, setFilteredMarketPrices, setMarketFilterState } from './state-market.js';
import { setMarketTableMode } from './render-market-table.js';

let _renderFn = null;
export function setRenderMarketCallback(fn) { _renderFn = fn; }

export function populateMarketFilters() {
    const countrySelect = $('mCountry');
    if (!countrySelect) return;

    const countries = [...new Set(
        marketPrices.filter(r => r.row_type === 'country').map(r => r.country)
    )].sort();

    countrySelect.innerHTML = '<option value="">Всі країни</option>' +
        countries.map(c => `<option value="${c}">${c}</option>`).join('');
}

export function applyMarketFilter() {
    const { country } = marketFilterState;
    let filtered = [...marketPrices];

    if (country) {
        filtered = filtered.filter(r =>
            r.country === country || r.row_type === 'average'
        );
    }

    setFilteredMarketPrices(filtered);
    if (_renderFn) _renderFn();
}

export function initMarketFilterEvents() {
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
            if (countrySelect) countrySelect.value = '';
            const tglBtns = $('tglWoodType');
            if (tglBtns) {
                tglBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                tglBtns.querySelector('[data-w="all"]')?.classList.add('active');
            }
            setMarketFilterState({ country: '', woodType: 'all' });
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
