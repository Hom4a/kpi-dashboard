// ===== Shared Application State =====

export let allData = [];
export let filtered = [];
export let period = 'all';
export let charts = {};
export let tblTab = 'realized';
export let autoRefreshInterval = null;
export let filterState = { mode: 'quick', quick: 'all', year: null, month: null, from: null, to: null };
export let targets = JSON.parse(localStorage.getItem('kpi_targets') || '{}');
export let currentProfile = null;

const PROFILE_CACHE_KEY = 'kpi_cached_profile';

// ES module exports are read-only bindings, so we need setter functions
export function setAllData(v) { allData = v; }
export function setFiltered(v) { filtered = v; }
export function setPeriod(v) { period = v; }
export function setCharts(v) { charts = v; }
export function setTblTab(v) { tblTab = v; }
export function setAutoRefreshInterval(v) { autoRefreshInterval = v; }
export function setFilterState(v) { filterState = v; }
export function setTargets(v) { targets = v; localStorage.setItem('kpi_targets', JSON.stringify(v)); }
export function setCurrentProfile(v) {
    currentProfile = v;
    if (v) {
        try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(v)); }
        catch (e) { /* localStorage full — ignore */ }
    } else {
        localStorage.removeItem(PROFILE_CACHE_KEY);
    }
}
export function getCachedProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

// Constants
export const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
export const WD = ['Неділя','Понеділок','Вівторок','Середа','Четвер',"П'ятниця",'Субота'];
