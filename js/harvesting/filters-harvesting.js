// ===== Harvesting Dashboard Filters =====
import { $ } from '../utils.js';
import { planFactData, zsuData, harvestingFilterState, setFilteredPlanFact, setFilteredZsu, setHarvestingFilterState } from './state-harvesting.js';

let _renderFn = null;
export function setRenderHarvestingCallback(fn) { _renderFn = fn; }

function unique(arr, key) {
    return [...new Set(arr.map(r => r[key]).filter(Boolean))].sort();
}

function fillSelect(id, options, current, placeholder) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` +
        options.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
}

export function populateHarvestingFilters() {
    const allRecords = [...planFactData, ...zsuData];
    fillSelect('hOffice', unique(allRecords, 'regional_office'), harvestingFilterState.office, 'Лісове обласне');
}

export function applyHarvestingFilter() {
    const fs = harvestingFilterState;
    const filterFn = r => {
        if (fs.office && r.regional_office !== fs.office) return false;
        return true;
    };
    setFilteredPlanFact(planFactData.filter(filterFn));
    setFilteredZsu(zsuData.filter(filterFn));
    if (_renderFn) _renderFn();
}

export function resetHarvestingFilters() {
    setHarvestingFilterState({ office: '' });
    populateHarvestingFilters();
    applyHarvestingFilter();
}

export function initHarvestingFilterEvents() {
    const el = $('hOffice');
    if (el) el.addEventListener('change', () => {
        harvestingFilterState.office = el.value;
        populateHarvestingFilters();
        applyHarvestingFilter();
    });
    const resetBtn = $('harvestingFilterReset');
    if (resetBtn) resetBtn.addEventListener('click', resetHarvestingFilters);
}
