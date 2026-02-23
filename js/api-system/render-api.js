// ===== API & System Page — Main Renderer with Tabs =====
import { renderMonitorTab } from './api-monitor.js';
import { renderConsoleTab } from './api-console.js';
import { renderAuditTab } from './audit-viewer.js';

let _currentTab = 'monitor';
let _initialized = false;

export function renderApiSystemPage() {
    const page = document.getElementById('pageApiSystem');
    if (!page) return;

    if (!_initialized) {
        page.innerHTML = `
            <div class="api-page">
                <div class="api-tabs">
                    <button class="api-tab active" data-tab="monitor">Моніторинг</button>
                    <button class="api-tab" data-tab="console">API Консоль</button>
                    <button class="api-tab" data-tab="audit">Аудит</button>
                </div>
                <div class="api-tab-content" id="apiTabContent"></div>
            </div>
        `;

        page.querySelectorAll('.api-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                _currentTab = tab.dataset.tab;
                page.querySelectorAll('.api-tab').forEach(t => t.classList.toggle('active', t === tab));
                renderCurrentTab();
            });
        });

        _initialized = true;
    }

    renderCurrentTab();
}

function renderCurrentTab() {
    const content = document.getElementById('apiTabContent');
    if (!content) return;

    switch (_currentTab) {
        case 'monitor': renderMonitorTab(content); break;
        case 'console': renderConsoleTab(content); break;
        case 'audit': renderAuditTab(content); break;
    }
}

export function resetApiSystemPage() {
    _initialized = false;
    _currentTab = 'monitor';
}
