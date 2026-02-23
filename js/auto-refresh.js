// ===== Auto-Refresh & Threshold Alerts =====
// Polling fallback when Realtime is not available
import { allData, targets, autoRefreshInterval, setAutoRefreshInterval } from './state.js';
import { fmt, toast } from './utils.js';
import { isRealtimeConnected } from './realtime.js';

let _loadAndRenderFn = null;
let _refreshInProgress = false;
export function setLoadAndRenderCallback(fn) { _loadAndRenderFn = fn; }
export function isRefreshInProgress() { return _refreshInProgress; }

export function startAutoRefresh() {
    stopAutoRefresh();
    const interval = setInterval(async () => {
        if (_refreshInProgress || isRealtimeConnected()) return;
        _refreshInProgress = true;
        try { if (_loadAndRenderFn) await _loadAndRenderFn(); }
        catch (e) { console.error('Auto-refresh error:', e); }
        finally { _refreshInProgress = false; }
    }, 5 * 60 * 1000);
    setAutoRefreshInterval(interval);
}

export function stopAutoRefresh() {
    if (autoRefreshInterval) { clearInterval(autoRefreshInterval); setAutoRefreshInterval(null); }
}

export function checkThresholds() {
    if (!targets.daily_realized && !targets.monthly_realized) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayData = allData.filter(r => r.date === today && r.type === 'realized');
    const todaySum = todayData.reduce((s, r) => s + r.value, 0);
    if (targets.daily_realized && todaySum > 0 && todaySum < targets.daily_realized) {
        toast(`Реалізація сьогодні (${fmt(todaySum)} м\u00B3) нижче плану (${fmt(targets.daily_realized)} м\u00B3)`, true);
    }
}
