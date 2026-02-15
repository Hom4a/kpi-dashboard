// ===== KPI Filters =====
import { $} from './utils.js';
import { allData, filterState, setFiltered, setFilterState, MO } from './state.js';

let _renderAllFn = null;
export function setRenderAllCallback(fn) { _renderAllFn = fn; }

export function populateFilters() {
    const years = [...new Set(allData.map(r => r._date.getFullYear()))].sort();
    const sel = $('filterYear');
    sel.innerHTML = '<option value="">Рік</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    const mSel = $('filterMonth');
    mSel.innerHTML = '<option value="">Місяць</option>' + MO.map((m, i) => `<option value="${i}">${m}</option>`).join('');
}

export function applyFilter() {
    const fs = filterState;
    let result;
    if (fs.mode === 'quick') {
        if (fs.quick === 'all') result = [...allData];
        else {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(fs.quick));
            result = allData.filter(r => r._date >= cutoff);
        }
    } else if (fs.mode === 'calendar') {
        result = allData.filter(r => {
            if (fs.year && r._date.getFullYear() !== parseInt(fs.year)) return false;
            if (fs.month !== null && fs.month !== '' && r._date.getMonth() !== parseInt(fs.month)) return false;
            return true;
        });
    } else if (fs.mode === 'range') {
        const from = fs.from ? new Date(fs.from) : new Date(0);
        const to = fs.to ? new Date(fs.to + 'T23:59:59') : new Date();
        result = allData.filter(r => r._date >= from && r._date <= to);
    } else {
        result = [...allData];
    }
    setFiltered(result);
    requestAnimationFrame(() => { setTimeout(() => { if (_renderAllFn) _renderAllFn(); }, 200); });
}

export function resetFilters() {
    setFilterState({ mode: 'quick', quick: 'all', year: null, month: null, from: null, to: null });
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.p === 'all'));
    $('filterYear').value = ''; $('filterMonth').value = '';
    $('filterFrom').value = ''; $('filterTo').value = '';
    applyFilter();
}

export function initFilterEvents() {
    // Quick filters
    document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        setFilterState({ mode: 'quick', quick: b.dataset.p, year: null, month: null, from: null, to: null });
        $('filterYear').value = ''; $('filterMonth').value = ''; $('filterFrom').value = ''; $('filterTo').value = '';
        applyFilter();
    }));
    // Calendar filters
    $('filterYear').addEventListener('change', () => {
        document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
        filterState.mode = 'calendar'; filterState.year = $('filterYear').value;
        $('filterFrom').value = ''; $('filterTo').value = '';
        applyFilter();
    });
    $('filterMonth').addEventListener('change', () => {
        document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
        filterState.mode = 'calendar'; filterState.month = $('filterMonth').value;
        $('filterFrom').value = ''; $('filterTo').value = '';
        applyFilter();
    });
    // Date range
    $('filterFrom').addEventListener('change', () => {
        document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
        filterState.mode = 'range'; filterState.from = $('filterFrom').value;
        $('filterYear').value = ''; $('filterMonth').value = '';
        applyFilter();
    });
    $('filterTo').addEventListener('change', () => {
        document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
        filterState.mode = 'range'; filterState.to = $('filterTo').value;
        $('filterYear').value = ''; $('filterMonth').value = '';
        applyFilter();
    });
    $('filterReset').addEventListener('click', resetFilters);
}
