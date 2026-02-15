// ===== Theme Management =====
import { $ } from './utils.js';

let _renderAllFn = null;
export function setRenderAllCallback(fn) { _renderAllFn = fn; }

export function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('kpi_theme', next);
    updateThemeUI();
    if (_renderAllFn) _renderAllFn();
}

export function updateThemeUI() {
    const isLight = document.documentElement.dataset.theme === 'light';
    $('themeIcon').innerHTML = isLight
        ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    $('themeLbl').textContent = isLight ? 'Темна тема' : 'Світла тема';
}

export function initTheme() {
    const saved = localStorage.getItem('kpi_theme');
    if (saved) document.documentElement.dataset.theme = saved;
    updateThemeUI();
}
