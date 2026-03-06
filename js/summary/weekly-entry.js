// ===== Weekly Briefing Data Entry =====
import { $, toast, showLoader } from '../utils.js';
import { saveSummaryWeekly, loadSummaryWeekly, loadSummaryWeeklyNotes } from './db-summary.js';
import { setSummaryWeekly, setSummaryWeeklyNotes } from './state-summary.js';
import { renderSummaryDashboard } from './render-summary.js';

const WEEKLY_SECTIONS = {
    kpi: {
        label: 'Ключові показники',
        cols: ['current', 'previous', 'ytd', 'delta'],
        colLabels: ['За тиждень', 'Попер. тиждень', 'З поч. року', 'Δ'],
        indicators: [
            'Незаконні рубки, вип.', 'Шкода, млн грн', 'Рейди, шт.',
            'Розміновано, га', 'Заготівля, тис. м3', 'Реалізація, тис. м3',
            'Склади, тис. м3', 'Реалізація, млн грн', 'Дебіторка, млрд грн',
            'Закупівлі, млн. грн', 'Допомога ЗСУ, млн грн'
        ]
    },
    forest_protection: {
        label: 'Охорона лісу',
        cols: ['ytd', 'current'],
        colLabels: ['З поч. року', 'За тиждень'],
        indicators: [
            'Кількість випадків', 'Обсяг, м3', 'Сума шкоди, млн грн',
            'Відшкодовано, млн грн', 'Частка відшкодування, %'
        ]
    },
    raids: {
        label: 'Рейдова робота',
        cols: ['ytd', 'current'],
        colLabels: ['З поч. року', 'За тиждень'],
        indicators: ['Кількість рейдів', 'Виявлено порушень', 'Складено протоколів', 'Протоколів на 100 рейдів']
    },
    mru_raids: {
        label: 'Спільні рейди з МРУ',
        cols: ['ytd', 'current'],
        colLabels: ['З поч. року', 'За тиждень'],
        indicators: ['Кількість рейдів, шт.', 'Виявлено порушень, шт.', 'Сума шкоди, тис. грн']
    },
    demining: {
        label: 'Розмінування',
        cols: ['current'],
        colLabels: ['Площа, тис. га'],
        indicators: [
            'Площа лісів, що зазнали впливу війни',
            'Площа лісів, що потребували розмінування',
            'Розміновано з початку війни',
            'Площа лісів, що потребують розмінування',
            'Розміновано з початку року'
        ]
    },
    certification: {
        label: 'Сертифікація',
        cols: ['current', 'ytd', 'delta'],
        colLabels: ['Надлісництва', 'Площа, млн га', 'Частка, %'],
        indicators: ['Сертифіковані FSC', 'Сертифіковані PEFC', 'Несертифіковані']
    },
    land_self_forested: {
        label: 'Самозалісені землі',
        cols: ['all_time', 'ytd', 'current'],
        colLabels: ['Весь період', 'З поч. року', 'За тиждень'],
        indicators: ['Надіслано клопотань, шт.', 'Площа, га', 'Позитивні рішення', 'Оформлено прав, га']
    },
    land_reforestation: {
        label: 'Землі під лісорозведення',
        cols: ['all_time', 'ytd', 'current'],
        colLabels: ['Весь період', 'З поч. року', 'За тиждень'],
        indicators: ['Надіслано клопотань, шт.', 'Площа, га', 'Позитивні рішення', 'Оформлено прав, га']
    },
    land_reserves: {
        label: 'Землі запасу лісогосп. призначення',
        cols: ['all_time', 'ytd', 'current'],
        colLabels: ['Весь період', 'З поч. року', 'За тиждень'],
        indicators: ['Подано клопотань, га', 'Оформлено прав, га']
    },
    harvesting: {
        label: 'Заготівля',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: [
            'Заготовлено з початку року, тис. м3',
            'Заготовлено за аналогічний період минулого року, тис. м3',
            'Δ по заготівлі з початку року, тис. м3',
            'Частка лісосічного фонду на поточний рік, %',
            'Заготовлено за тиждень, тис. м3',
            'Заготовлено за попередній тиждень, тис. м3',
            'Δ по заготівлі за тиждень, тис. м3',
            'Загальні залишки, тис. м3',
            'Δ по залишках за тиждень, тис. м3',
            'Залишки круглих лісоматеріалів, тис. м3',
            "Залишки дров'яної деревини НП, тис. м3"
        ]
    },
    contracts: {
        label: 'Договори',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: [
            'Аукціонні, обсяг млн м3', 'Аукціонні, сума млрд грн', 'Аукціонні, виконання %',
            'Prozorro, обсяг млн м3', 'Prozorro, сума млрд грн', 'Prozorro, виконання %',
            'Прямі, обсяг млн м3', 'Прямі, сума млрд грн',
            'Форвардні, обсяг млн м3', 'Форвардні, сума млрд грн'
        ]
    },
    sales: {
        label: 'Реалізація',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: [
            'Реалізовано з початку року, тис. м3',
            'Реалізовано за аналогічний період минулого року, тис. м3',
            'Δ до минулого року, тис. м3',
            'Реалізовано з початку року, млн грн',
            'Реалізовано за аналогічний період минулого року, млн грн',
            'Δ до минулого року, млн грн',
            'Реалізовано за тиждень, тис. м3',
            'Реалізовано за попередній тиждень, тис. м3',
            'Δ до попереднього тижня, тис. м3',
            'Реалізовано за тиждень, млн грн',
            'Реалізовано за попередній тиждень, млн грн',
            'Δ до попереднього тижня, млн грн',
            'Середня ціна, грн/м3',
            'Δ до минулого року, грн/м3'
        ]
    },
    finance: {
        label: 'Фінансовий стан',
        cols: ['current', 'delta'],
        colLabels: ['Значення', 'Δ за тиждень'],
        indicators: [
            'Залишки коштів, млрд грн',
            'Дебіторська заборгованість, млрд грн',
            'у т.ч. прострочена',
            'Кредиторська заборгованість, млрд грн'
        ]
    },
    personnel: {
        label: 'Персонал',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: ['Облікова чисельність, чол.', 'Вакансії, шт.од.', 'Середня заробітна плата, тис. грн']
    },
    legal: {
        label: 'Правові питання',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: ['Загальна площа земель, га', 'Оформлено речових прав, га/%', 'Потребує оформлення, га/%']
    },
    procurement: {
        label: 'Закупівлі',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: ['Процедури з початку року, шт.', 'Сума, млн грн', 'Укладено договорів, шт.', 'Сума договорів, млн грн']
    },
    zsu: {
        label: 'Допомога ЗСУ',
        cols: ['current'],
        colLabels: ['Значення'],
        indicators: ['Допомога з початку року, млн грн', 'у т.ч. лісопродукція, млн грн', 'Обсяг лісопродукції, м3']
    }
};

const NOTE_TYPES = [
    { type: 'general', label: 'Загальна оцінка тижня' },
    { type: 'events', label: 'Ключові події' },
    { type: 'positive', label: 'Позитивна динаміка' },
    { type: 'negative', label: 'Негативна / ризикова' },
    { type: 'decisions', label: 'Питання для рішення' }
];

let _entryVisible = false;
let _onBackCallback = null;

export function initWeeklyEntry() {
    const btn = $('btnWeeklyEntry');
    if (btn) {
        btn.style.display = '';
        btn.onclick = toggleEntryPanel;
    }
}

function toggleEntryPanel() {
    _entryVisible = !_entryVisible;
    const panel = $('weeklyEntryPanel');
    if (!panel) return;
    panel.style.display = _entryVisible ? '' : 'none';
    if (_entryVisible) buildEntryForm(panel, null);
}

/**
 * Render weekly entry form in any container (used from data-entry page)
 * @param {HTMLElement} container - target container
 * @param {Function} onBack - callback when user clicks "Назад"
 */
export function renderWeeklyEntryForm(container, onBack) {
    _onBackCallback = onBack || null;
    container.innerHTML = `
        <div class="de-form-header">
            <button class="btn btn-sm de-back-btn" id="weBackBtn">\u2190 Назад</button>
            <div class="de-form-title">
                <h3>Тижнева довідка</h3>
                <small>Внесення оперативних показників за тиждень</small>
            </div>
            <label class="btn btn-sm" style="margin-left:auto">Завантажити .docx
                <input type="file" id="weDocxUpload" accept=".docx" style="display:none">
            </label>
        </div>
        <div id="weeklyEntryFormBody"></div>
    `;
    const body = container.querySelector('#weeklyEntryFormBody');
    buildEntryForm(body, onBack);

    container.querySelector('#weBackBtn').onclick = () => {
        if (_onBackCallback) _onBackCallback();
    };

    // .docx upload via dynamic import
    const docxInput = container.querySelector('#weDocxUpload');
    if (docxInput) {
        docxInput.onchange = async () => {
            if (docxInput.files[0]) {
                const { handleFile } = await import('../file-handler.js');
                await handleFile(docxInput.files[0], 'summary_weekly');
                if (_onBackCallback) _onBackCallback();
            }
        };
    }
}

function buildEntryForm(panel, onBack) {
    if (!panel) return;

    const today = new Date().toISOString().slice(0, 10);

    panel.innerHTML = `
        <div class="entry-form">
            <div class="entry-row">
                <label>Дата звіту: <input type="date" id="weReportDate" value="${today}" class="filter-input"></label>
                <button class="btn btn-sm" id="weFillPrev">Заповнити з минулого тижня</button>
            </div>

            <h4 style="margin:16px 0 8px">Текстова частина</h4>
            ${NOTE_TYPES.map(n => `
                <div class="entry-note">
                    <label>${n.label}</label>
                    <textarea id="weNote_${n.type}" class="entry-textarea" rows="2" placeholder="${n.label}..."></textarea>
                </div>
            `).join('')}

            <h4 style="margin:16px 0 8px">Секція даних</h4>
            <select id="weSectionSelect" class="filter-select">
                ${Object.entries(WEEKLY_SECTIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
            </select>
            <div id="weSectionTable" style="margin-top:12px"></div>

            <div style="margin-top:16px;display:flex;gap:8px">
                <button class="btn" id="weSaveAll">Зберегти все</button>
                <button class="btn btn-sm" id="weCancel" style="opacity:.7">Скасувати</button>
            </div>
        </div>
    `;

    // Bind section selector
    const sel = panel.querySelector('#weSectionSelect') || $('weSectionSelect');
    if (sel) {
        sel.onchange = () => renderSectionInputs(sel.value);
    }
    renderSectionInputs('kpi');

    // Fill from previous week
    const fillBtn = panel.querySelector('#weFillPrev') || $('weFillPrev');
    if (fillBtn) fillBtn.onclick = fillFromPreviousWeek;

    // Save
    const saveBtn = panel.querySelector('#weSaveAll') || $('weSaveAll');
    if (saveBtn) saveBtn.onclick = () => saveAllSections(onBack);

    // Cancel
    const cancelBtn = panel.querySelector('#weCancel') || $('weCancel');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (onBack) {
                onBack();
            } else {
                _entryVisible = false;
                const p = $('weeklyEntryPanel');
                if (p) p.style.display = 'none';
            }
        };
    }
}

function renderSectionInputs(sectionKey) {
    const section = WEEKLY_SECTIONS[sectionKey];
    if (!section) return;
    const container = $('weSectionTable');
    if (!container) return;

    const cols = section.cols;
    const colLabels = section.colLabels;

    container.innerHTML = `
        <table class="tbl entry-tbl">
            <thead><tr><th>Показник</th>${colLabels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>
                ${section.indicators.map((ind, idx) => `
                    <tr>
                        <td>${ind}</td>
                        ${cols.map(c => `<td><input type="number" step="any" class="entry-input" data-section="${sectionKey}" data-ind="${idx}" data-col="${c}" placeholder="0"></td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Auto-calculate delta when current and previous change
    if (cols.includes('current') && cols.includes('delta')) {
        container.querySelectorAll('input[data-col="current"], input[data-col="previous"]').forEach(inp => {
            inp.oninput = () => {
                const row = inp.closest('tr');
                const cur = parseFloat(row.querySelector('[data-col="current"]')?.value) || 0;
                const prev = parseFloat(row.querySelector('[data-col="previous"]')?.value) || 0;
                const deltaInp = row.querySelector('[data-col="delta"]');
                if (deltaInp && !deltaInp.dataset.manual) {
                    deltaInp.value = (cur - prev) || '';
                }
            };
        });
        container.querySelectorAll('input[data-col="delta"]').forEach(inp => {
            inp.oninput = () => { inp.dataset.manual = '1'; };
        });
    }
}

async function fillFromPreviousWeek() {
    showLoader(true);
    try {
        const prev = await loadSummaryWeekly(1);
        if (!prev.length) {
            toast('Немає даних попереднього тижня');
            showLoader(false);
            return;
        }
        // Fill inputs from previous data (works in both summary page and data-entry page)
        const inputs = document.querySelectorAll('.entry-input[data-section]');
        inputs.forEach(inp => {
            const section = inp.dataset.section;
            const idx = parseInt(inp.dataset.ind);
            const col = inp.dataset.col;
            const sectionDef = WEEKLY_SECTIONS[section];
            if (!sectionDef) return;
            const indName = sectionDef.indicators[idx];
            const match = prev.find(r => r.section === section && r.indicator_name === indName);
            if (match) {
                const colMap = { current: 'value_current', previous: 'value_previous', ytd: 'value_ytd', delta: 'value_delta', all_time: 'value_text' };
                const val = match[colMap[col]];
                if (val != null) inp.value = val;
            }
        });

        // Fill notes
        const prevDate = prev[0]?.report_date;
        if (prevDate) {
            const notes = await loadSummaryWeeklyNotes(prevDate);
            notes.forEach(n => {
                const ta = $(`weNote_${n.note_type}`);
                if (ta) ta.value = n.content;
            });
        }
        toast('Дані минулого тижня завантажено');
    } catch (e) { toast('Помилка: ' + e.message, true); }
    showLoader(false);
}

async function saveAllSections(onBack) {
    const reportDate = document.getElementById('weReportDate')?.value;
    if (!reportDate) { toast('Вкажіть дату звіту', true); return; }

    showLoader(true);
    try {
        // Collect all indicator records from ALL sections
        const records = [];
        for (const [sectionKey, sectionDef] of Object.entries(WEEKLY_SECTIONS)) {
            const inputs = document.querySelectorAll(`#weSectionTable .entry-input[data-section="${sectionKey}"]`);
            // Group by indicator index
            const indMap = {};
            inputs.forEach(inp => {
                const idx = inp.dataset.ind;
                const col = inp.dataset.col;
                if (!indMap[idx]) indMap[idx] = {};
                const v = inp.value.trim();
                indMap[idx][col] = v !== '' ? parseFloat(v) : null;
            });

            for (const [idx, vals] of Object.entries(indMap)) {
                const indName = sectionDef.indicators[parseInt(idx)];
                if (Object.values(vals).every(v => v == null)) continue; // Skip empty rows
                records.push({
                    section: sectionKey,
                    indicator_name: indName,
                    value_current: vals.current ?? null,
                    value_previous: vals.previous ?? null,
                    value_ytd: vals.ytd ?? null,
                    value_delta: vals.delta ?? null,
                    value_text: vals.all_time != null ? String(vals.all_time) : null
                });
            }
        }

        // Collect notes
        const notes = NOTE_TYPES.map(n => ({
            note_type: n.type,
            content: ($(`weNote_${n.type}`)?.value || '').trim()
        })).filter(n => n.content);

        if (!records.length && !notes.length) {
            toast('Заповніть хоча б один показник або текстове поле', true);
            showLoader(false);
            return;
        }

        const result = await saveSummaryWeekly(records, notes, reportDate);
        if (result.added === 0 && result.updated === 0) {
            toast('Дані вже актуальні, змін не внесено.');
        } else {
            toast(`Збережено (${reportDate}): додано ${result.added}, оновлено ${result.updated} показників`);
        }

        // Reload and rerender
        const [weekly, weeklyNotes] = await Promise.all([
            loadSummaryWeekly(), loadSummaryWeeklyNotes()
        ]);
        setSummaryWeekly(weekly);
        setSummaryWeeklyNotes(weeklyNotes);

        if (onBack) {
            // Called from data-entry page — go back to form list
            onBack();
        } else {
            // Called from summary page inline panel
            _entryVisible = false;
            const panel = $('weeklyEntryPanel');
            if (panel) panel.style.display = 'none';
        }
        renderSummaryDashboard();
    } catch (e) { toast('Помилка збереження: ' + e.message, true); console.error(e); }
    showLoader(false);
}
