// ===== Utility Functions =====

export function $(id) { return document.getElementById(id); }
export function show(id) { $(id).style.display = ''; }
export function hide(id) { $(id).style.display = 'none'; }

export function showLoader(v) { $('loader').classList.toggle('on', v); }

export function toast(t, isError) {
    const el = $('toast'); el.textContent = t; el.classList.toggle('error', !!isError);
    el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 3500);
}

export function withTimeout(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise((resolve, reject) => setTimeout(() => {
            if (fallback !== undefined) resolve(fallback);
            else reject(new Error('Timeout'));
        }, ms))
    ]);
}

export function showKpiSkeletons(gridId, count) {
    const grid = $(gridId); if (!grid) return;
    grid.innerHTML = Array.from({length: count}, () =>
        '<div class="glass kpi-card" style="min-height:80px"><div class="skeleton" style="width:60%;height:10px;margin-bottom:8px">&nbsp;</div><div class="skeleton" style="width:80%;height:24px;margin-bottom:8px">&nbsp;</div><div class="skeleton" style="width:50%;height:10px">&nbsp;</div></div>'
    ).join('');
}

export function fmt(n, d = 0) {
    return n == null || isNaN(n) ? '—' : n.toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtDate(s) { return new Date(s).toLocaleDateString('uk-UA'); }

export function themeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
