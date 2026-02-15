// ===== Forest Dashboard Filters =====
import { $ } from '../utils.js';
import {
    pricesData, inventoryData,
    filteredPrices, filteredInventory,
    forestFilterState,
    setFilteredPrices, setFilteredInventory, setForestFilterState
} from './state-forest.js';

let _renderFn = null;
export function setRenderForestCallback(fn) { _renderFn = fn; }

function unique(arr, key) {
    return [...new Set(arr.map(r => r[key]).filter(Boolean))].sort();
}

export function populateForestFilters() {
    const allRecords = [...pricesData, ...inventoryData];
    const fs = forestFilterState;

    // Cascade: filter available options based on current selections
    let pool = allRecords;
    if (fs.branch) pool = pool.filter(r => r.branch === fs.branch);
    if (fs.region) pool = pool.filter(r => r.region === fs.region);
    if (fs.product) pool = pool.filter(r => r.product === fs.product);

    fillSelect('fBranch', unique(allRecords, 'branch'), fs.branch, 'Філія');
    fillSelect('fRegion', unique(pool, 'region'), fs.region, 'Область');
    fillSelect('fProduct', unique(pool, 'product'), fs.product, 'Продукція');
    fillSelect('fSpecies', unique(pool, 'species'), fs.species, 'Порода');
    fillSelect('fWarehouse', unique(pool, 'warehouse'), fs.warehouse, 'Склад');
    fillSelect('fQuality', unique(pool, 'quality_class'), fs.quality, 'Клас якості');
}

function fillSelect(id, options, current, placeholder) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` +
        options.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
}

export function applyForestFilter() {
    const fs = forestFilterState;
    const filterFn = r => {
        if (fs.branch && r.branch !== fs.branch) return false;
        if (fs.region && r.region !== fs.region) return false;
        if (fs.product && r.product !== fs.product) return false;
        if (fs.species && r.species !== fs.species) return false;
        if (fs.warehouse && r.warehouse !== fs.warehouse) return false;
        if (fs.quality && r.quality_class !== fs.quality) return false;
        return true;
    };
    setFilteredPrices(pricesData.filter(filterFn));
    setFilteredInventory(inventoryData.filter(filterFn));
    if (_renderFn) _renderFn();
}

export function resetForestFilters() {
    setForestFilterState({ branch: '', region: '', product: '', species: '', warehouse: '', quality: '' });
    populateForestFilters();
    applyForestFilter();
}

export function initForestFilterEvents() {
    const fields = [
        { id: 'fBranch', key: 'branch' },
        { id: 'fRegion', key: 'region' },
        { id: 'fProduct', key: 'product' },
        { id: 'fSpecies', key: 'species' },
        { id: 'fWarehouse', key: 'warehouse' },
        { id: 'fQuality', key: 'quality' }
    ];
    fields.forEach(f => {
        const el = $(f.id);
        if (!el) return;
        el.addEventListener('change', () => {
            forestFilterState[f.key] = el.value;
            // Cascade: repopulate dependent filters
            populateForestFilters();
            applyForestFilter();
        });
    });
    const resetBtn = $('forestFilterReset');
    if (resetBtn) resetBtn.addEventListener('click', resetForestFilters);
}
