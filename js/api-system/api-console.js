// ===== API Console — Interactive RPC Tester =====
import { sb } from '../config.js';

const RPC_CATALOG = [
    {
        name: 'get_executive_metrics', label: 'Executive Metrics',
        description: 'Агрегація всіх даних для Executive дашборду',
        params: []
    },
    {
        name: 'get_record_counts', label: 'Record Counts',
        description: 'Кількість записів у всіх таблицях',
        params: []
    },
    {
        name: 'get_kpi_summary', label: 'KPI Summary',
        description: 'Агрегація KPI за період (обсяги, фінанси, помісячно)',
        params: [
            { key: 'p_date_from', label: 'Дата від', type: 'date', required: false },
            { key: 'p_date_to', label: 'Дата до', type: 'date', required: false }
        ]
    },
    {
        name: 'get_forest_summary', label: 'Forest Summary',
        description: 'Агрегація цін і залишків з фільтрами',
        params: [
            { key: 'p_branch', label: 'Філія', type: 'text', required: false },
            { key: 'p_product', label: 'Продукт', type: 'text', required: false },
            { key: 'p_species', label: 'Порода', type: 'text', required: false }
        ]
    },
    {
        name: 'get_harvesting_summary', label: 'Harvesting Summary',
        description: 'План-факт заготівлі + ЗСУ',
        params: []
    },
    {
        name: 'get_market_comparison', label: 'Market Comparison',
        description: 'Порівняння ринкових цін UA vs EU',
        params: [
            { key: 'p_period', label: 'Період', type: 'text', required: false }
        ]
    },
    {
        name: 'get_system_health', label: 'System Health',
        description: 'Здоров\'я системи: таблиці, завантаження, алерти',
        params: []
    },
    {
        name: 'get_anomalies', label: 'Anomalies',
        description: 'Виявлення аномалій у KPI та заготівлі',
        params: []
    },
    {
        name: 'get_audit_log', label: 'Audit Log',
        description: 'Аудит-лог змін у БД з фільтрами',
        params: [
            { key: 'p_limit', label: 'Ліміт', type: 'number', required: false, default: 50 },
            { key: 'p_offset', label: 'Зсув', type: 'number', required: false, default: 0 },
            { key: 'p_table_name', label: 'Таблиця', type: 'text', required: false },
            { key: 'p_action', label: 'Дія (INSERT/UPDATE/DELETE)', type: 'text', required: false }
        ]
    },
    {
        name: 'clear_data', label: 'Clear Data',
        description: '⚠️ Видалити всі дані з таблиці (admin/editor)',
        params: [
            { key: 'p_table', label: 'Назва таблиці', type: 'text', required: true }
        ]
    }
];

export function renderConsoleTab(container) {
    container.innerHTML = `
        <div class="api-console">
            <div class="api-console-sidebar">
                <h3>RPC-функції</h3>
                <div class="api-fn-list">
                    ${RPC_CATALOG.map((fn, i) => `
                        <div class="api-fn-item" data-idx="${i}">
                            <div class="api-fn-name">${fn.name}()</div>
                            <div class="api-fn-desc">${fn.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="api-console-main">
                <div class="api-console-header">
                    <span id="apiConsoleFnName">Виберіть функцію</span>
                    <button class="btn btn-sm api-execute-btn" id="apiExecuteBtn" disabled>Виконати</button>
                </div>
                <div id="apiConsoleParams" class="api-console-params"></div>
                <div class="api-console-result">
                    <div class="api-console-result-header">
                        <span>Результат</span>
                        <span id="apiConsoleTime" class="api-console-time"></span>
                    </div>
                    <pre id="apiConsoleOutput" class="api-console-output">// Результат з'явиться тут</pre>
                </div>
            </div>
        </div>
    `;

    // Bind events
    container.querySelectorAll('.api-fn-item').forEach(el => {
        el.addEventListener('click', () => selectFunction(parseInt(el.dataset.idx)));
    });

    document.getElementById('apiExecuteBtn').addEventListener('click', executeSelected);
}

let _selectedFn = null;

function selectFunction(idx) {
    _selectedFn = RPC_CATALOG[idx];

    // Highlight
    document.querySelectorAll('.api-fn-item').forEach(el =>
        el.classList.toggle('active', parseInt(el.dataset.idx) === idx)
    );

    // Update header
    document.getElementById('apiConsoleFnName').textContent = `${_selectedFn.name}()`;
    document.getElementById('apiExecuteBtn').disabled = false;

    // Render params
    const paramsEl = document.getElementById('apiConsoleParams');
    if (!_selectedFn.params.length) {
        paramsEl.innerHTML = '<div class="api-no-params">Без параметрів</div>';
    } else {
        paramsEl.innerHTML = _selectedFn.params.map(p => `
            <div class="api-param-row">
                <label class="api-param-label">${p.label} <span class="api-param-key">(${p.key})</span></label>
                <input class="api-param-input" data-key="${p.key}" type="${p.type}"
                    placeholder="${p.required ? 'Обов\'язково' : 'Опціонально'}"
                    value="${p.default !== undefined ? p.default : ''}">
            </div>
        `).join('');
    }

    // Clear result
    document.getElementById('apiConsoleOutput').textContent = '// Натисніть "Виконати"';
    document.getElementById('apiConsoleTime').textContent = '';
}

async function executeSelected() {
    if (!_selectedFn) return;

    const btn = document.getElementById('apiExecuteBtn');
    const output = document.getElementById('apiConsoleOutput');
    const timeEl = document.getElementById('apiConsoleTime');

    btn.disabled = true;
    btn.textContent = 'Виконання...';
    output.textContent = '// Виконується...';

    // Collect params
    const params = {};
    document.querySelectorAll('.api-param-input').forEach(input => {
        const val = input.value.trim();
        if (val) {
            if (input.type === 'number') params[input.dataset.key] = parseInt(val);
            else params[input.dataset.key] = val;
        }
    });

    const start = performance.now();
    try {
        const { data, error } = await sb.rpc(_selectedFn.name, Object.keys(params).length ? params : undefined);
        const ms = Math.round(performance.now() - start);

        if (error) {
            output.textContent = `// ERROR\n${JSON.stringify(error, null, 2)}`;
            output.classList.add('api-error-output');
            timeEl.textContent = `${ms}ms | ERROR`;
        } else {
            const json = JSON.stringify(data, null, 2);
            output.textContent = json;
            output.classList.remove('api-error-output');
            const size = new Blob([json]).size;
            timeEl.textContent = `${ms}ms | ${formatBytes(size)} | ${typeof data === 'object' ? (Array.isArray(data) ? data.length + ' items' : Object.keys(data).length + ' keys') : typeof data}`;
        }
    } catch (e) {
        output.textContent = `// EXCEPTION\n${e.message}`;
        output.classList.add('api-error-output');
        timeEl.textContent = `${Math.round(performance.now() - start)}ms | EXCEPTION`;
    }

    btn.disabled = false;
    btn.textContent = 'Виконати';
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}
