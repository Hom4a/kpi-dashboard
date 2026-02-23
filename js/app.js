// ===== Application Entry Point =====
import { sb } from './config.js';
import { $, show, hide, showLoader, toast, fmtDate } from './utils.js';
import { allData, filtered, charts, tblTab, currentProfile, setAllData, setFiltered, setCharts, setTblTab } from './state.js';
import { initTheme, toggleTheme, setRenderAllCallback as setThemeRenderAll } from './theme.js';
import { handleLogin, handleLogout, showAuthScreen, hideButtons, showAppForUser, initAuthListener, setLoadAndRenderCallback as setAuthLoadAndRender, setHideButtonsCallback, UPLOAD_ROLES, DATA_MANAGE_ROLES, TARGET_ROLES } from './auth.js';
import { switchPage, openMobileUpload, initSwipeGestures } from './navigation.js';
import { populateFilters, applyFilter, resetFilters, initFilterEvents, setRenderAllCallback as setFilterRenderAll } from './filters.js';
import { showDrillDown, closeDrillDown, toggleFullscreen, openTargetModal, closeTargetModal, saveTargets, openFormatHelp, closeFormatHelp, openViewerAccess, closeViewerAccess, saveViewerAccess, openDataManage, closeDataManage, setRenderAllCallback as setModalsRenderAll, createUser, toggleAddUserForm, generateNewUserPassword } from './modals.js';
import { renderAll } from './render-all.js';
import { setMainMode, renderTable } from './render-volumes.js';
import { exportExcel } from './export.js';
import { loadAllRecords, clearDB, undoLastKpiUpload } from './db-kpi.js';
import { handleFile, setLoadAndRenderCallback as setFileHandlerLoadAndRender, setLoadForestCallback, setLoadHarvestingCallback } from './file-handler.js';
import { startAutoRefresh, stopAutoRefresh, checkThresholds, setLoadAndRenderCallback as setAutoRefreshLoadAndRender } from './auto-refresh.js';
// Forest modules
import { setPricesData, setInventoryData, setFilteredPrices, setFilteredInventory } from './forest/state-forest.js';
import { loadPricesData, loadInventoryData, clearPricesData, clearInventoryData } from './forest/db-forest.js';
import { populateForestFilters, applyForestFilter, initForestFilterEvents, setRenderForestCallback } from './forest/filters-forest.js';
import { renderForestDashboard } from './forest/render-forest.js';
import { renderPricesTable, renderInventoryTable, setPricesGroupBy, setInventoryGroupBy } from './forest/render-forest-table.js';
// Harvesting modules
import { setPlanFactData, setZsuData } from './harvesting/state-harvesting.js';
import { loadPlanFactData, loadZsuData, clearPlanFactData, clearZsuData } from './harvesting/db-harvesting.js';
import { populateHarvestingFilters, applyHarvestingFilter, initHarvestingFilterEvents, setRenderHarvestingCallback } from './harvesting/filters-harvesting.js';
import { renderHarvestingDashboard } from './harvesting/render-harvesting.js';
// Executive modules
import { renderExecutiveDashboard } from './executive/render-executive.js';
// Market modules
import { setMarketPrices, setMarketUaDetail, setMarketHistory, setEurRates, setMarketMeta, setAllPeriods } from './market/state-market.js';
import { loadMarketPrices, loadMarketUaDetail, loadMarketHistory, loadEurRates, clearMarketData as clearMarketDB, undoLastMarketUpload as undoMarketDB } from './market/db-market.js';
import { populateMarketFilters, applyMarketFilter, initMarketFilterEvents, setRenderMarketCallback } from './market/filters-market.js';
import { renderMarketDashboard } from './market/render-market.js';
import { setLoadMarketCallback } from './file-handler.js';
// Data Entry modules
import { initDataEntry, setDataEntryReloadCallback } from './data-entry/data-entry.js';
// Builder modules
import { initDashboardList } from './builder/dashboard-list.js';

// ===== Show buttons based on role (called after ALL data loads) =====
function showRoleButtons() {
    const role = currentProfile ? currentProfile.role : 'viewer';
    // Upload button
    if (UPLOAD_ROLES.includes(role)) {
        $('btnUpload').style.display = '';
        const helpBtn = $('btnFormatHelp');
        if (helpBtn) helpBtn.style.display = '';
    }
    // Targets button
    if (TARGET_ROLES.includes(role)) {
        $('btnTargets').style.display = '';
    }
    // Data management button
    if (DATA_MANAGE_ROLES.includes(role)) {
        show('btnClear');
    }
    // Admin-only: viewer access
    if (role === 'admin') {
        const vaBtn = $('btnViewerAccess');
        if (vaBtn) vaBtn.style.display = '';
    }
    // Dashboards button (admin + analyst)
    if (['admin', 'analyst'].includes(role)) {
        const dbBtn = $('btnDashboards');
        if (dbBtn) dbBtn.style.display = '';
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
        if (!DATA_MANAGE_ROLES.includes(role)) { hide('btnClear'); }
        if (!TARGET_ROLES.includes(role)) { $('btnTargets').style.display = 'none'; }
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

// ===== Load & Render Market =====
async function loadMarketDataAndRender() {
    try {
        const [prices, uaDetail, history, rates] = await Promise.all([
            loadMarketPrices(), loadMarketUaDetail(), loadMarketHistory(), loadEurRates()
        ]);
        console.log('Market loaded:', prices.length, 'prices,', uaDetail.length, 'ua,', history.length, 'history,', rates.length, 'rates');
        setMarketPrices(prices);
        setMarketUaDetail(uaDetail);
        setMarketHistory(history);
        setEurRates(rates);
        // Build sorted period list and set meta from latest
        const periods = [...new Set(prices.map(r => r.period).filter(Boolean))].sort().reverse();
        setAllPeriods(periods);
        if (prices.length) {
            const latest = prices.find(r => r.period === periods[0]) || prices[0];
            setMarketMeta({ period: latest.period || '', eurRate: latest.eur_rate || 0 });
        }
        if (prices.length || history.length) {
            hide('empty'); $('dash').style.display = 'block';
        }
        populateMarketFilters();
        applyMarketFilter();
    } catch(e) { console.error('loadMarketDataAndRender error:', e); }
}

// ===== Wire callbacks =====
setThemeRenderAll(renderAll);
setFilterRenderAll(renderAll);
setModalsRenderAll(renderAll);
setAuthLoadAndRender(async () => { await Promise.all([loadAndRender(), loadForestDataAndRender(), loadHarvestingDataAndRender(), loadMarketDataAndRender()]); await renderExecutiveDashboard(); showRoleButtons(); initDataEntry(); initDashboardList($('builderContent')); });
setHideButtonsCallback(hideButtons);
setFileHandlerLoadAndRender(async () => { await loadAndRender(); showRoleButtons(); });
setLoadForestCallback(async () => { await loadForestDataAndRender(); await renderExecutiveDashboard(); });
setLoadHarvestingCallback(async () => { await loadHarvestingDataAndRender(); await renderExecutiveDashboard(); });
setLoadMarketCallback(async () => { await loadMarketDataAndRender(); await renderExecutiveDashboard(); });
setAutoRefreshLoadAndRender(async () => { await Promise.all([loadAndRender(), loadForestDataAndRender(), loadHarvestingDataAndRender(), loadMarketDataAndRender()]); await renderExecutiveDashboard(); showRoleButtons(); });
setRenderForestCallback(renderForestDashboard);
setRenderHarvestingCallback(renderHarvestingDashboard);
setRenderMarketCallback(renderMarketDashboard);

// Data entry reload: when user modifies data via forms, refresh the relevant dashboard
setDataEntryReloadCallback(async (targetTable) => {
    if (targetTable === 'kpi_records') { await loadAndRender(); showRoleButtons(); }
    else if (targetTable === 'forest_prices' || targetTable === 'forest_inventory') { await loadForestDataAndRender(); }
    else if (targetTable === 'harvesting_plan_fact' || targetTable === 'harvesting_zsu') { await loadHarvestingDataAndRender(); }
    else if (['market_prices', 'market_prices_ua', 'market_price_history', 'eur_rates'].includes(targetTable)) { await loadMarketDataAndRender(); }
    await renderExecutiveDashboard();
});

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
window.createUser = createUser;
window.toggleAddUserForm = toggleAddUserForm;
window.generateNewUserPassword = generateNewUserPassword;
window.openDataManage = openDataManage;
window.closeDataManage = closeDataManage;
window.openDashboardsPage = () => { switchPage('builder'); initDashboardList($('builderContent')); };

// ===== Data Management action handlers =====
window.clearKpiData = async () => {
    if (!confirm('Очистити всі дані KPI (обсяги та фінанси)?')) return;
    showLoader(true);
    try {
        await clearDB();
        setAllData([]); setFiltered([]);
        Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} }); setCharts({});
        await loadAndRender(); showRoleButtons();
        toast('Дані KPI очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.undoLastKpi = async () => {
    if (!confirm('Скасувати останнє завантаження KPI?')) return;
    showLoader(true);
    try {
        const result = await undoLastKpiUpload();
        toast(`Скасовано: ${result.fileName} (${result.removed} записів)`);
        await loadAndRender(); showRoleButtons();
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.clearPrices = async () => {
    if (!confirm('Очистити дані середньозважених цін?')) return;
    showLoader(true);
    try {
        await clearPricesData();
        await loadForestDataAndRender();
        await renderExecutiveDashboard();
        toast('Дані цін очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.clearInventory = async () => {
    if (!confirm('Очистити дані залишків лісопродукції?')) return;
    showLoader(true);
    try {
        await clearInventoryData();
        await loadForestDataAndRender();
        await renderExecutiveDashboard();
        toast('Дані залишків очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.clearPlanFact = async () => {
    if (!confirm('Очистити дані план-факт заготівлі?')) return;
    showLoader(true);
    try {
        await clearPlanFactData();
        await loadHarvestingDataAndRender();
        await renderExecutiveDashboard();
        toast('Дані план-факт очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.clearZsu = async () => {
    if (!confirm('Очистити дані ЗСУ?')) return;
    showLoader(true);
    try {
        await clearZsuData();
        await loadHarvestingDataAndRender();
        await renderExecutiveDashboard();
        toast('Дані ЗСУ очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};

window.clearMarketData = async () => {
    if (!confirm('Очистити дані ринкових цін?')) return;
    showLoader(true);
    try {
        await clearMarketDB();
        setMarketPrices([]); setMarketUaDetail([]); setMarketHistory([]); setEurRates([]);
        await loadMarketDataAndRender();
        await renderExecutiveDashboard();
        toast('Дані ринкових цін очищено');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};
window.undoLastMarketUpload = async () => {
    if (!confirm('Скасувати останнє завантаження ринкових цін?')) return;
    showLoader(true);
    try {
        await undoMarketDB();
        await loadMarketDataAndRender();
        await renderExecutiveDashboard();
        toast('Останнє завантаження ринкових цін скасовано');
        openDataManage();
    } catch (err) { toast('Помилка: ' + err.message, true); }
    showLoader(false);
};

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

    // Market Filters
    initMarketFilterEvents();

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

    // Auth keyboard shortcuts
    $('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    $('authEmail').addEventListener('keydown', e => { if (e.key === 'Enter') $('authPass').focus(); });

    // Fullscreen ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.chart-card.fullscreen').forEach(c => c.classList.remove('fullscreen'));
            closeDrillDown(); closeTargetModal(); closeFormatHelp(); closeViewerAccess(); closeDataManage();
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
