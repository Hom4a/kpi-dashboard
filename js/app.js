// ===== Application Entry Point =====
import { sb } from './config.js';
import { $, show, hide, showLoader, toast, fmtDate } from './utils.js';
import { allData, filtered, charts, tblTab, currentProfile, setAllData, setFiltered, setCharts, setTblTab } from './state.js';
import { initTheme, toggleTheme, setRenderAllCallback as setThemeRenderAll } from './theme.js';
import { handleLogin, handleLogout, showAuthScreen, hideButtons, showAppForUser, initAuthListener, setLoadAndRenderCallback as setAuthLoadAndRender, setHideButtonsCallback } from './auth.js';
import { switchPage, openMobileUpload, initSwipeGestures } from './navigation.js';
import { populateFilters, applyFilter, resetFilters, initFilterEvents, setRenderAllCallback as setFilterRenderAll } from './filters.js';
import { showDrillDown, closeDrillDown, toggleFullscreen, openTargetModal, closeTargetModal, saveTargets, openFormatHelp, closeFormatHelp, openViewerAccess, closeViewerAccess, saveViewerAccess, setRenderAllCallback as setModalsRenderAll } from './modals.js';
import { renderAll } from './render-all.js';
import { setMainMode, renderTable } from './render-volumes.js';
import { exportExcel } from './export.js';
import { loadAllRecords, clearDB } from './db-kpi.js';
import { handleFile, setLoadAndRenderCallback as setFileHandlerLoadAndRender, setLoadForestCallback, setLoadHarvestingCallback } from './file-handler.js';
import { startAutoRefresh, stopAutoRefresh, checkThresholds, setLoadAndRenderCallback as setAutoRefreshLoadAndRender } from './auto-refresh.js';
// Forest modules
import { setPricesData, setInventoryData, setFilteredPrices, setFilteredInventory } from './forest/state-forest.js';
import { loadPricesData, loadInventoryData } from './forest/db-forest.js';
import { populateForestFilters, applyForestFilter, initForestFilterEvents, setRenderForestCallback } from './forest/filters-forest.js';
import { renderForestDashboard } from './forest/render-forest.js';
import { renderPricesTable, renderInventoryTable, setPricesGroupBy, setInventoryGroupBy } from './forest/render-forest-table.js';
// Harvesting modules
import { setPlanFactData, setZsuData } from './harvesting/state-harvesting.js';
import { loadPlanFactData, loadZsuData } from './harvesting/db-harvesting.js';
import { populateHarvestingFilters, applyHarvestingFilter, initHarvestingFilterEvents, setRenderHarvestingCallback } from './harvesting/filters-harvesting.js';
import { renderHarvestingDashboard } from './harvesting/render-harvesting.js';

// ===== Show buttons based on role (called after ALL data loads) =====
function showRoleButtons() {
    const role = currentProfile ? currentProfile.role : 'viewer';
    if (role === 'admin' || role === 'editor') {
        $('btnUpload').style.display = '';
        const helpBtn = $('btnFormatHelp');
        if (helpBtn) helpBtn.style.display = '';
    }
    if (role === 'admin') {
        $('btnTargets').style.display = '';
        show('btnClear');
        const vaBtn = $('btnViewerAccess');
        if (vaBtn) vaBtn.style.display = '';
    }
}

// ===== Load & Render KPI =====
async function loadAndRender() {
    try {
        const raw = await loadAllRecords();
        console.log('Loaded records:', raw.length);
        setAllData(raw.map(r => ({ ...r, _date: new Date(r.date) })).sort((a, b) => a._date - b._date));
        if (!allData.length) {
            $('hdrSub').textContent = 'Завантажте файл для початку'; return;
        }
        hide('empty'); $('dash').style.display = 'block';
        $('btnExport').style.display = ''; $('btnPrint').style.display = ''; $('liveInfo').style.display = '';
        const role = currentProfile ? currentProfile.role : 'viewer';
        if (role !== 'admin') { hide('btnClear'); $('btnTargets').style.display = 'none'; }
        const dates = allData.map(r => r._date);
        const minD = new Date(Math.min(...dates)), maxD = new Date(Math.max(...dates));
        $('hdrSub').textContent = `${fmtDate(minD)} — ${fmtDate(maxD)} | ${allData.length} записів`;
        const hasCash = allData.some(r => r.type === 'cash_daily' || r.type === 'cash_monthly');
        const finEmpty = $('finEmptyState');
        if (finEmpty) finEmpty.style.display = hasCash ? 'none' : '';
        const cashCard = $('cashChartCard');
        if (cashCard) cashCard.style.display = hasCash ? '' : 'none';
        populateFilters();
        applyFilter();
        checkThresholds();
    } catch(e) { console.error('loadAndRender error:', e); toast('Помилка: ' + e.message, true); }
}

// ===== Load & Render Forest =====
async function loadForestDataAndRender() {
    try {
        const [prices, inventory] = await Promise.all([loadPricesData(), loadInventoryData()]);
        console.log('Forest loaded:', prices.length, 'prices,', inventory.length, 'inventory');
        setPricesData(prices);
        setInventoryData(inventory);
        // Also show dashboard if we have forest data even without KPI data
        if (prices.length || inventory.length) {
            hide('empty'); $('dash').style.display = 'block';
        }
        populateForestFilters();
        applyForestFilter();
    } catch(e) { console.error('loadForestDataAndRender error:', e); }
}

// ===== Load & Render Harvesting =====
async function loadHarvestingDataAndRender() {
    try {
        const [planFact, zsu] = await Promise.all([loadPlanFactData(), loadZsuData()]);
        console.log('Harvesting loaded:', planFact.length, 'plan-fact,', zsu.length, 'zsu');
        setPlanFactData(planFact);
        setZsuData(zsu);
        if (planFact.length || zsu.length) {
            hide('empty'); $('dash').style.display = 'block';
        }
        populateHarvestingFilters();
        applyHarvestingFilter();
    } catch(e) { console.error('loadHarvestingDataAndRender error:', e); }
}

// ===== Wire callbacks =====
setThemeRenderAll(renderAll);
setFilterRenderAll(renderAll);
setModalsRenderAll(renderAll);
setAuthLoadAndRender(async () => { await loadAndRender(); await loadForestDataAndRender(); await loadHarvestingDataAndRender(); showRoleButtons(); });
setHideButtonsCallback(hideButtons);
setFileHandlerLoadAndRender(async () => { await loadAndRender(); showRoleButtons(); });
setLoadForestCallback(loadForestDataAndRender);
setLoadHarvestingCallback(loadHarvestingDataAndRender);
setAutoRefreshLoadAndRender(async () => { await loadAndRender(); await loadForestDataAndRender(); await loadHarvestingDataAndRender(); showRoleButtons(); });
setRenderForestCallback(renderForestDashboard);
setRenderHarvestingCallback(renderHarvestingDashboard);

// ===== Expose global functions for onclick handlers in HTML =====
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.switchPage = switchPage;
window.openMobileUpload = openMobileUpload;
window.toggleTheme = toggleTheme;
window.toggleFullscreen = toggleFullscreen;
window.openTargetModal = openTargetModal;
window.closeTargetModal = closeTargetModal;
window.closeDrillDown = closeDrillDown;
window.saveTargets = saveTargets;
window.openFormatHelp = openFormatHelp;
window.closeFormatHelp = closeFormatHelp;
window.exportExcel = exportExcel;
window.openViewerAccess = openViewerAccess;
window.closeViewerAccess = closeViewerAccess;
window.saveViewerAccess = saveViewerAccess;

// ===== Error handlers =====
window.onerror = function(msg, url, line) {
    console.error('Global error:', msg, url, line);
    const t = document.getElementById('toast');
    if (t) { t.textContent = 'JS Error: ' + msg; t.className = 'toast error on'; }
    const ae = document.getElementById('authError');
    if (ae) ae.textContent = 'JS: ' + msg;
};
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled rejection:', e.reason);
    const t = document.getElementById('toast');
    if (t) { t.textContent = 'Error: ' + (e.reason?.message || e.reason); t.className = 'toast error on'; }
    const ae = document.getElementById('authError');
    if (ae && ae.textContent === '') ae.textContent = 'Error: ' + (e.reason?.message || e.reason);
});

// ===== DOMContentLoaded =====
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // File input handlers
    $('fileHdr').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; });
    $('fileDrop').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; });

    // Drag & drop
    const dz = $('dropZone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

    // KPI Filters
    initFilterEvents();

    // Forest Filters
    initForestFilterEvents();

    // Harvesting Filters
    initHarvestingFilterEvents();

    // Main chart toggle
    $('tglMain').addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        $('tglMain').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active'); setMainMode(btn.dataset.m);
    });

    // Table toggle (KPI)
    $('tglTbl').addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        $('tglTbl').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active'); setTblTab(btn.dataset.t); renderTable();
    });

    // Table toggle (Prices)
    const tglPrices = $('tglPricesTable');
    if (tglPrices) tglPrices.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        tglPrices.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active'); setPricesGroupBy(btn.dataset.g); renderPricesTable();
    });

    // Table toggle (Inventory)
    const tglInv = $('tglInventoryTable');
    if (tglInv) tglInv.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        tglInv.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active'); setInventoryGroupBy(btn.dataset.g); renderInventoryTable();
    });

    // Clear DB
    $('btnClear').addEventListener('click', async () => {
        if (!confirm('Очистити всю базу даних?')) return;
        showLoader(true);
        try {
            await clearDB(); setAllData([]); setFiltered([]);
            Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} }); setCharts({});
            await loadAndRender(); toast('Базу очищено');
        } catch (err) { toast('Помилка: ' + err.message, true); }
        showLoader(false);
    });

    // Auth keyboard shortcuts
    $('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    $('authEmail').addEventListener('keydown', e => { if (e.key === 'Enter') $('authPass').focus(); });

    // Fullscreen ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.chart-card.fullscreen').forEach(c => c.classList.remove('fullscreen'));
            closeDrillDown(); closeTargetModal(); closeFormatHelp(); closeViewerAccess();
        }
    });

    // Header compact on scroll
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (window.scrollY > 60) header.classList.add('compact');
        else header.classList.remove('compact');
    }, { passive: true });

    // Mobile swipe
    initSwipeGestures();

    // Auth listener
    initAuthListener();
});
