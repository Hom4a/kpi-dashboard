// ===== Authentication =====
import { sb } from './config.js';
import { $, show, hide, showKpiSkeletons, withTimeout, toast } from './utils.js';
import { allData, filtered, charts, currentProfile, setAllData, setFiltered, setCharts, setCurrentProfile } from './state.js';
import { setupChartDefaults } from './charts-common.js';
import { startAutoRefresh, stopAutoRefresh } from './auto-refresh.js';

let _authInProgress = false;
let _loadAndRenderFn = null;
let _hideButtonsFn = null;

export function setLoadAndRenderCallback(fn) { _loadAndRenderFn = fn; }
export function setHideButtonsCallback(fn) { _hideButtonsFn = fn; }

export async function getCurrentProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) return null;
    return data;
}

export function showAuthScreen() {
    $('authScreen').classList.add('on');
    $('authError').textContent = '';
    $('authEmail').value = '';
    $('authPass').value = '';
    setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 100);
}

export function hideAuthScreen() { $('authScreen').classList.remove('on'); }

export function showAuthLoading(v) {
    const el = $('authLoadingOverlay');
    if (el) el.classList.toggle('on', v);
}

export async function handleLogin() {
    const email = $('authEmail').value.trim(), pass = $('authPass').value;
    if (!email || !pass) { $('authError').textContent = 'Введіть email та пароль'; return; }
    $('btnLogin').disabled = true; $('btnLogin').textContent = 'Вхід...'; $('authError').textContent = '';
    try {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) {
            $('authError').textContent = error.message === 'Invalid login credentials'
                ? 'Невірний email або пароль' : error.message;
        }
    } catch(e) { $('authError').textContent = "Помилка з'єднання"; }
    $('btnLogin').disabled = false; $('btnLogin').textContent = 'Увійти';
}

export async function handleLogout() {
    stopAutoRefresh();
    await sb.auth.signOut();
    setCurrentProfile(null); setAllData([]); setFiltered([]);
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} }); setCharts({});
    hide('dash'); show('empty'); $('userInfo').style.display = 'none';
    $('hdrSub').textContent = 'Завантажте файл для початку';
    if (_hideButtonsFn) _hideButtonsFn();
    showAuthScreen();
}

export function hideButtons() {
    ['btnUpload','btnFormatHelp','btnClear','btnExport','btnPrint','btnTargets','liveInfo'].forEach(id => {
        try { $(id).style.display = 'none'; } catch(e){}
    });
}

export async function showAppForUser(user) {
    if (_authInProgress) return;
    _authInProgress = true;
    showAuthLoading(true);
    try {
        showKpiSkeletons('kpiGrid', 6);
        const profile = await withTimeout(getCurrentProfile(), 8000, null);
        setCurrentProfile(profile);
        const role = profile ? profile.role : 'viewer';
        const displayName = profile && profile.full_name ? profile.full_name : user.email;
        $('userInfo').style.display = 'flex';
        $('userName').textContent = displayName;
        const badge = $('roleBadge'); badge.textContent = role; badge.className = 'role-badge ' + role;
        if (role === 'admin' || role === 'editor') {
            $('btnUpload').style.display = '';
            const helpBtn = $('btnFormatHelp');
            if (helpBtn) helpBtn.style.display = '';
        } else {
            $('btnUpload').style.display = 'none';
            const helpBtn = $('btnFormatHelp');
            if (helpBtn) helpBtn.style.display = 'none';
        }
        setupChartDefaults();
        const { getRecordCount } = await import('./db-kpi.js');
        const count = await withTimeout(getRecordCount(), 8000, 0);
        if (count > 0 && _loadAndRenderFn) await withTimeout(_loadAndRenderFn(), 15000, null);
        startAutoRefresh();
        hideAuthScreen();
    } catch(e) {
        console.error('showAppForUser error:', e);
        try { await sb.auth.signOut(); } catch(x) {}
        setCurrentProfile(null); setAllData([]); setFiltered([]);
        $('userInfo').style.display = 'none';
        showAuthScreen();
        $('authError').textContent = 'Сесія застаріла — увійдіть знову';
    } finally {
        _authInProgress = false;
        showAuthLoading(false);
    }
}

export function initAuthListener() {
    if (!sb) { toast('Supabase не ініціалізовано', true); showAuthScreen(); return; }
    sb.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth event:', event);
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            await showAppForUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            setCurrentProfile(null); setAllData([]); setFiltered([]);
            $('userInfo').style.display = 'none';
            hideButtons(); showAuthScreen();
        }
    });
    // Fallback: if onAuthStateChange doesn't fire within 3s, check manually
    setTimeout(async () => {
        if (_authInProgress) return;
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session && !_authInProgress) await showAppForUser(session.user);
        } catch(e) {
            console.error('Fallback session check error:', e);
            try { await sb.auth.signOut(); } catch(x) {}
            $('authError').textContent = 'Сесія застаріла — увійдіть знову';
        }
    }, 3000);
}
