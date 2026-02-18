// ===== Widget Config Panel — right-side panel for widget settings =====
import { getAllSources } from './data-source.js';
import { AGGREGATIONS, FORMAT_OPTIONS, COLOR_OPTIONS } from './widget-catalog.js';

let _onConfigChanged = null;
let _currentWidget = null;

export function setOnConfigChanged(fn) { _onConfigChanged = fn; }

export async function renderConfigPanel(panel, widget) {
    _currentWidget = widget;
    if (!widget) {
        panel.innerHTML = '<div class="wb-cfg-empty"><p>Оберіть віджет для налаштування</p></div>';
        return;
    }

    const cfg = widget.config || {};
    const sources = await getAllSources();

    panel.innerHTML = `
        <div class="wb-cfg-header">
            <h4>Налаштування</h4>
            <button class="wb-cfg-close" id="cfgClose">&times;</button>
        </div>
        <div class="wb-cfg-body">
            <div class="wb-cfg-field">
                <label>Заголовок</label>
                <input type="text" class="de-input" id="cfgTitle" value="${esc(cfg.title || '')}">
            </div>

            ${needsDataSource(widget.type) ? `
                <div class="wb-cfg-field">
                    <label>Джерело даних</label>
                    <select class="de-input" id="cfgSource">
                        ${Object.entries(sources).map(([k, v]) => `<option value="${k}"${cfg.data_source === k ? ' selected' : ''}>${v.label}</option>`).join('')}
                    </select>
                </div>
            ` : ''}

            ${renderTypeSpecificFields(widget.type, cfg, sources)}

            <div class="wb-cfg-actions">
                <button class="btn btn-sm btn-danger" id="cfgDelete">Видалити віджет</button>
            </div>
        </div>
    `;

    // Wire events
    wireEvents(panel, widget, sources);
}

function needsDataSource(type) {
    return type !== 'text_widget';
}

function renderTypeSpecificFields(type, cfg, sources) {
    const src = sources[cfg.data_source];
    const fields = src ? src.fields : [];
    const fieldOpts = fields.map(f => `<option value="${f.name}">${f.label}</option>`).join('');
    const numFields = fields.filter(f => f.type === 'number');
    const numFieldOpts = numFields.map(f => `<option value="${f.name}">${f.label}</option>`).join('');

    switch (type) {
        case 'kpi_card':
            return `
                <div class="wb-cfg-field"><label>Метрика</label>
                    <select class="de-input" id="cfgMetric">${selectWithValue(numFieldOpts, cfg.metric_field)}</select></div>
                <div class="wb-cfg-field"><label>Агрегація</label>
                    <select class="de-input" id="cfgAgg">${selectOpts(AGGREGATIONS, cfg.aggregation)}</select></div>
                <div class="wb-cfg-field"><label>Формат</label>
                    <select class="de-input" id="cfgFormat">${selectOpts(FORMAT_OPTIONS, cfg.format)}</select></div>
                <div class="wb-cfg-field"><label>Колір</label>
                    <select class="de-input" id="cfgColor">${selectOpts(COLOR_OPTIONS, cfg.color)}</select></div>
            `;
        case 'line_chart':
        case 'bar_chart':
            return `
                <div class="wb-cfg-field"><label>Вісь X (група)</label>
                    <select class="de-input" id="cfgXField">${selectWithValue(fieldOpts, cfg.x_field)}</select></div>
                <div class="wb-cfg-field"><label>Вісь Y (метрика)</label>
                    <select class="de-input" id="cfgYField">${selectWithValue(numFieldOpts, cfg.y_field)}</select></div>
                <div class="wb-cfg-field"><label>Агрегація</label>
                    <select class="de-input" id="cfgAgg">${selectOpts(AGGREGATIONS, cfg.aggregation)}</select></div>
                <div class="wb-cfg-field"><label>Колір</label>
                    <select class="de-input" id="cfgColor">${selectOpts(COLOR_OPTIONS, cfg.color)}</select></div>
                ${type === 'line_chart' ? `<div class="wb-cfg-field"><label><input type="checkbox" id="cfgFill" ${cfg.fill ? 'checked' : ''}> Заливка</label></div>` : ''}
                ${type === 'bar_chart' ? `
                    <div class="wb-cfg-field"><label><input type="checkbox" id="cfgHorizontal" ${cfg.horizontal ? 'checked' : ''}> Горизонтальний</label></div>
                ` : ''}
            `;
        case 'pie_chart':
            return `
                <div class="wb-cfg-field"><label>Група</label>
                    <select class="de-input" id="cfgGroupBy">${selectWithValue(fieldOpts, cfg.group_by)}</select></div>
                <div class="wb-cfg-field"><label>Метрика</label>
                    <select class="de-input" id="cfgMetric">${selectWithValue(numFieldOpts, cfg.metric_field)}</select></div>
                <div class="wb-cfg-field"><label>Агрегація</label>
                    <select class="de-input" id="cfgAgg">${selectOpts(AGGREGATIONS, cfg.aggregation)}</select></div>
                <div class="wb-cfg-field"><label><input type="checkbox" id="cfgDoughnut" ${cfg.doughnut ? 'checked' : ''}> Doughnut</label></div>
            `;
        case 'table_widget':
            return `
                <div class="wb-cfg-field"><label>Група (опціонально)</label>
                    <select class="de-input" id="cfgGroupBy"><option value="">—</option>${selectWithValue(fieldOpts, cfg.group_by)}</select></div>
                <div class="wb-cfg-field"><label>Метрика (для групи)</label>
                    <select class="de-input" id="cfgMetric"><option value="">—</option>${selectWithValue(numFieldOpts, cfg.metric_field)}</select></div>
                <div class="wb-cfg-field"><label>Агрегація</label>
                    <select class="de-input" id="cfgAgg"><option value="">—</option>${selectOpts(AGGREGATIONS, cfg.aggregation)}</select></div>
                <div class="wb-cfg-field"><label>Ліміт</label>
                    <input type="number" class="de-input" id="cfgLimit" value="${cfg.limit || 50}" min="5" max="500"></div>
            `;
        case 'text_widget':
            return `
                <div class="wb-cfg-field"><label>Зміст</label>
                    <textarea class="de-input" id="cfgContent" rows="4">${esc(cfg.content || '')}</textarea></div>
                <div class="wb-cfg-field"><label>Вирівнювання</label>
                    <select class="de-input" id="cfgAlign">
                        <option value="left"${cfg.align === 'left' ? ' selected' : ''}>Ліворуч</option>
                        <option value="center"${cfg.align === 'center' ? ' selected' : ''}>По центру</option>
                        <option value="right"${cfg.align === 'right' ? ' selected' : ''}>Праворуч</option>
                    </select></div>
            `;
        case 'gauge':
            return `
                <div class="wb-cfg-field"><label>Поле значення</label>
                    <select class="de-input" id="cfgValueField">${selectWithValue(numFieldOpts, cfg.value_field)}</select></div>
                <div class="wb-cfg-field"><label>Поле цілі</label>
                    <select class="de-input" id="cfgTargetField">${selectWithValue(numFieldOpts, cfg.target_field)}</select></div>
                <div class="wb-cfg-field"><label>Агрегація</label>
                    <select class="de-input" id="cfgAgg">${selectOpts(AGGREGATIONS, cfg.aggregation)}</select></div>
            `;
        case 'alert_list':
            return `
                <div class="wb-cfg-field"><label>Поле умови</label>
                    <select class="de-input" id="cfgCondField">${selectWithValue(numFieldOpts, cfg.condition_field)}</select></div>
                <div class="wb-cfg-field"><label>Поріг (%)</label>
                    <input type="number" class="de-input" id="cfgThreshold" value="${cfg.threshold || 80}"></div>
                <div class="wb-cfg-field"><label>Поле підпису</label>
                    <select class="de-input" id="cfgLabelField">${selectWithValue(fieldOpts, cfg.label_field)}</select></div>
            `;
        default:
            return '';
    }
}

function wireEvents(panel, widget, sources) {
    const cfg = widget.config;
    const emit = () => { if (_onConfigChanged) _onConfigChanged(widget); };

    // Close
    const closeBtn = panel.querySelector('#cfgClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        _currentWidget = null;
        panel.innerHTML = '<div class="wb-cfg-empty"><p>Оберіть віджет для налаштування</p></div>';
    });

    // Delete
    const delBtn = panel.querySelector('#cfgDelete');
    if (delBtn) delBtn.addEventListener('click', () => {
        if (_onConfigChanged) _onConfigChanged(widget, 'delete');
    });

    // Title
    bindInput(panel, '#cfgTitle', v => { cfg.title = v; emit(); });

    // Data source change — re-render the panel to update field lists
    const srcSel = panel.querySelector('#cfgSource');
    if (srcSel) {
        srcSel.addEventListener('change', async () => {
            cfg.data_source = srcSel.value;
            emit();
            await renderConfigPanel(panel, widget);
        });
    }

    // Type-specific bindings
    bindInput(panel, '#cfgMetric', v => { cfg.metric_field = v; emit(); });
    bindInput(panel, '#cfgAgg', v => { cfg.aggregation = v; emit(); });
    bindInput(panel, '#cfgFormat', v => { cfg.format = v; emit(); });
    bindInput(panel, '#cfgColor', v => { cfg.color = v; emit(); });
    bindInput(panel, '#cfgXField', v => { cfg.x_field = v; emit(); });
    bindInput(panel, '#cfgYField', v => { cfg.y_field = v; emit(); });
    bindInput(panel, '#cfgGroupBy', v => { cfg.group_by = v; emit(); });
    bindInput(panel, '#cfgContent', v => { cfg.content = v; emit(); });
    bindInput(panel, '#cfgAlign', v => { cfg.align = v; emit(); });
    bindInput(panel, '#cfgValueField', v => { cfg.value_field = v; emit(); });
    bindInput(panel, '#cfgTargetField', v => { cfg.target_field = v; emit(); });
    bindInput(panel, '#cfgCondField', v => { cfg.condition_field = v; emit(); });
    bindInput(panel, '#cfgThreshold', v => { cfg.threshold = Number(v) || 80; emit(); });
    bindInput(panel, '#cfgLabelField', v => { cfg.label_field = v; emit(); });
    bindInput(panel, '#cfgLimit', v => { cfg.limit = Number(v) || 50; emit(); });
    bindCheckbox(panel, '#cfgFill', v => { cfg.fill = v; emit(); });
    bindCheckbox(panel, '#cfgHorizontal', v => { cfg.horizontal = v; emit(); });
    bindCheckbox(panel, '#cfgDoughnut', v => { cfg.doughnut = v; emit(); });
}

function bindInput(panel, sel, fn) {
    const el = panel.querySelector(sel);
    if (el) el.addEventListener('change', () => fn(el.value));
}

function bindCheckbox(panel, sel, fn) {
    const el = panel.querySelector(sel);
    if (el) el.addEventListener('change', () => fn(el.checked));
}

function selectOpts(options, selected) {
    return options.map(o => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`).join('');
}

function selectWithValue(optionsHtml, selected) {
    if (!selected) return optionsHtml;
    return optionsHtml.replace(`value="${selected}"`, `value="${selected}" selected`);
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
