// ===== File Handling & Auto-Detection =====
import { $, showLoader, toast } from './utils.js';
import { currentProfile } from './state.js';
import { UPLOAD_ROLES } from './auth.js';
import { loadXLSX } from './lazy-libs.js';
import { parseKpiFile } from './parse-kpi.js';
import { saveRecords } from './db-kpi.js';
import { parsePricesFile } from './forest/parse-prices.js';
import { parseInventoryFile } from './forest/parse-inventory.js';
import { savePricesData, saveInventoryData } from './forest/db-forest.js';
import { parsePlanFactFile } from './harvesting/parse-plan-fact.js';
import { parseZsuFile } from './harvesting/parse-zsu.js';
import { savePlanFactData, saveZsuData } from './harvesting/db-harvesting.js';
import { parseMarketPricesFile } from './market/parse-market-prices.js';
import { saveMarketData } from './market/db-market.js';
import { parseSummaryXlsx } from './summary/parse-summary-xlsx.js';
import { parseSummaryDocx } from './summary/parse-summary-docx.js';
import { saveSummaryIndicators, saveSummaryWeekly } from './summary/db-summary.js';
import { parseReception } from './wood-accounting/parse-reception.js';
import { parseSales } from './wood-accounting/parse-sales.js';
import { saveReceptionData, saveSalesData } from './wood-accounting/db-wood.js';

let _loadAndRenderFn = null;
let _loadForestFn = null;
let _loadHarvestingFn = null;
let _loadMarketFn = null;
let _loadSummaryFn = null;
let _loadWoodFn = null;
export function setLoadAndRenderCallback(fn) { _loadAndRenderFn = fn; }
export function setLoadForestCallback(fn) { _loadForestFn = fn; }
export function setLoadHarvestingCallback(fn) { _loadHarvestingFn = fn; }
export function setLoadMarketCallback(fn) { _loadMarketFn = fn; }
export function setLoadSummaryCallback(fn) { _loadSummaryFn = fn; }
export function setLoadWoodCallback(fn) { _loadWoodFn = fn; }

const MARKET_COUNTRIES = ['україна', 'фінляндія', 'німеччина', 'польща', 'латвія', 'литва', 'швеція', 'норвегія', 'естонія', 'австрія'];

export function detectFileType(wb, fileName) {
    // Summary indicators: check FIRST — these files contain "залишок" which would misdetect as inventory
    const sheetYears = wb.SheetNames.filter(n => /^20\d{2}$/.test(n.trim()));
    if (sheetYears.length >= 2) return 'summary_indicators';
    if ((fileName || '').toLowerCase().includes('основні показники')) return 'summary_indicators';

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: true });
    let countryHits = 0;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
        const row = (rows[i] || []).map(c => (c || '').toString().toLowerCase());
        const joined = row.join(' ');
        // ЕОД reports (1С) — check before other forest-related patterns
        if (joined.includes('приймання лісопродукції')) return 'wood_reception';
        if (joined.includes('реалізація лісопродукції')) return 'wood_sales';
        if (joined.includes('ціна за 1 м3') || joined.includes('ціна за 1 м³') ||
            (joined.includes('країна') && (joined.includes('сосна') || joined.includes('ялина')) && joined.includes('дуб'))) return 'market_prices';
        if (joined.includes('середньозважен') || (joined.includes('вартість') && joined.includes('продукція'))) return 'prices';
        if (joined.includes('залишок') || joined.includes('надлісництво')) return 'inventory';
        if (joined.includes('виконання планових') || joined.includes('планових показників') || (joined.includes('річн') && joined.includes('план') && joined.includes('заготів'))) return 'harvesting_plan_fact';
        if (joined.includes('вилучення') || (joined.includes('лісопродукції') && joined.includes('зсу'))) return 'harvesting_zsu';
        MARKET_COUNTRIES.forEach(c => { if (joined.includes(c)) countryHits++; });
    }
    if (countryHits >= 3) return 'market_prices';
    // Check sheet names or file name for market price indicators
    const namePool = [...wb.SheetNames, fileName || ''].map(n => n.toLowerCase()).join(' ');
    if (/ціни|ціна|prices/i.test(namePool)) return 'market_prices';
    return 'kpi';
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const FILE_TYPE_LABELS = {
    kpi: 'KPI обсяги/фінанси', prices: 'середньозважені ціни', inventory: 'залишки лісопродукції',
    harvesting_plan_fact: 'план-факт заготівлі', harvesting_zsu: 'дані ЗСУ', market_prices: 'ринкові ціни',
    summary_indicators: 'основні показники діяльності',
    summary_weekly: 'тижнева довідка (.docx)',
    wood_reception: 'приймання лісопродукції (ЕОД)',
    wood_sales: 'реалізація лісопродукції (ЕОД)'
};

export async function handleFile(file, expectedType = null) {
    const role = currentProfile ? currentProfile.role : 'viewer';
    if (!UPLOAD_ROLES.includes(role)) { toast('У вас немає прав для завантаження даних', true); return; }
    if (file.size > MAX_FILE_SIZE) { toast(`Файл занадто великий (${(file.size / 1024 / 1024).toFixed(1)} MB). Максимум: 50 MB`, true); return; }
    showLoader(true);
    try {
        const buffer = await file.arrayBuffer();

        // Handle .docx files (weekly briefing) — before XLSX.read which would fail on docx
        const isDocx = file.name.toLowerCase().endsWith('.docx')
            || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            || /\.docx$/i.test(file.name);
        if (isDocx) {
            if (expectedType && !expectedType.split(',').includes('summary_weekly')) {
                toast('Файл .docx — тижнева довідка. Використайте сторінку "Зведення".', true);
                showLoader(false);
                return;
            }
            await handleDocxFile(buffer, file.name);
            showLoader(false);
            return;
        }

        await loadXLSX();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const fileType = detectFileType(wb, file.name);

        // Validate file type if uploaded from a specific page
        if (expectedType) {
            const allowedTypes = expectedType.split(',');
            if (!allowedTypes.includes(fileType)) {
                const detected = FILE_TYPE_LABELS[fileType] || fileType;
                const expected = allowedTypes.map(t => FILE_TYPE_LABELS[t] || t).join(' або ');
                toast(`Цей файл визначено як "${detected}", а очікується "${expected}". Використайте головну кнопку або перейдіть на відповідну сторінку.`, true);
                showLoader(false);
                return;
            }
        }

        if (fileType === 'market_prices') {
            const parsed = parseMarketPricesFile(wb);
            const total = parsed.prices.length + parsed.uaDetail.length + parsed.history.length + parsed.eurRates.length;
            if (!total) { toast('Файл не містить числових даних для імпорту.'); showLoader(false); return; }
            const result = await saveMarketData(parsed, file.name);
            if (result.count === 0 && result.skipped > 0) {
                toast(`Ці дані вже завантажено (${result.skipped} записів). Змін не внесено.`);
            } else {
                toast(`Ринкові ціни: завантажено ${result.count} записів`);
            }
            if (_loadMarketFn) await _loadMarketFn();
            showLoader(false);
            return;
        }

        if (fileType === 'prices') {
            const records = parsePricesFile(wb);
            if (!records.length) { toast('Файл не містить даних про ціни. Перевірте формат.', true); showLoader(false); return; }
            const result = await savePricesData(records, file.name);
            if (result.added === 0 && result.replaced === 0) {
                toast('Файл не містить нових даних.');
            } else if (result.added === 0) {
                toast(`Ціни: замінено ${result.replaced} існуючих записів`);
            } else {
                toast(`Ціни: додано ${result.added} нових, замінено ${result.replaced} існуючих`);
            }
            if (_loadForestFn) await _loadForestFn();
            showLoader(false);
            return;
        }

        if (fileType === 'inventory') {
            const records = parseInventoryFile(wb);
            if (!records.length) { toast('Файл не містить даних про залишки. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveInventoryData(records, file.name);
            if (result.added === 0 && result.replaced === 0) {
                toast('Файл не містить нових даних.');
            } else if (result.added === 0) {
                toast(`Залишки: замінено ${result.replaced} існуючих записів`);
            } else {
                toast(`Залишки: додано ${result.added} нових, замінено ${result.replaced} існуючих`);
            }
            if (_loadForestFn) await _loadForestFn();
            showLoader(false);
            return;
        }

        if (fileType === 'harvesting_plan_fact') {
            const records = parsePlanFactFile(wb);
            if (!records.length) { toast('Файл не містить даних план-факт. Перевірте формат.', true); showLoader(false); return; }
            const result = await savePlanFactData(records, file.name);
            if (result.added === 0 && result.replaced === 0) {
                toast('Файл не містить нових даних.');
            } else if (result.added === 0) {
                toast(`План-факт: замінено ${result.replaced} існуючих записів`);
            } else {
                toast(`План-факт: додано ${result.added} нових, замінено ${result.replaced} існуючих`);
            }
            if (_loadHarvestingFn) await _loadHarvestingFn();
            showLoader(false);
            return;
        }

        if (fileType === 'harvesting_zsu') {
            const records = parseZsuFile(wb);
            if (!records.length) { toast('Файл не містить даних ЗСУ. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveZsuData(records, file.name);
            if (result.added === 0 && result.replaced === 0) {
                toast('Файл не містить нових даних.');
            } else if (result.added === 0) {
                toast(`Дані ЗСУ: замінено ${result.replaced} існуючих записів`);
            } else {
                toast(`Дані ЗСУ: додано ${result.added} нових, замінено ${result.replaced} існуючих`);
            }
            if (_loadHarvestingFn) await _loadHarvestingFn();
            showLoader(false);
            return;
        }

        if (fileType === 'wood_reception') {
            const parsed = parseReception(wb);
            if (!parsed.rows.length) { toast('Файл не містить даних приймання. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveReceptionData(parsed, file.name);
            if (result.replaced > 0) {
                toast(`Приймання (ЕОД): оновлено ${result.added} записів (замінено ${result.replaced})`);
            } else {
                toast(`Приймання (ЕОД): завантажено ${result.added} записів`);
            }
            if (_loadWoodFn) await _loadWoodFn();
            showLoader(false);
            return;
        }

        if (fileType === 'wood_sales') {
            const parsed = parseSales(wb);
            if (!parsed.rows.length) { toast('Файл не містить даних реалізації. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveSalesData(parsed, file.name);
            if (result.replaced > 0) {
                toast(`Реалізація (ЕОД): оновлено ${result.added} записів (замінено ${result.replaced})`);
            } else {
                toast(`Реалізація (ЕОД): завантажено ${result.added} записів`);
            }
            if (_loadWoodFn) await _loadWoodFn();
            showLoader(false);
            return;
        }

        if (fileType === 'summary_indicators') {
            const parsed = parseSummaryXlsx(wb);
            if (!parsed.records.length) { toast('Файл не містить даних "Основні показники". Перевірте формат.', true); showLoader(false); return; }
            const result = await saveSummaryIndicators(parsed.records, file.name);
            if (result.added === 0 && result.updated === 0) {
                toast('Зведення: дані вже актуальні, змін не внесено.');
            } else {
                toast(`Зведення: завантажено ${result.total} показників (додано ${result.added}, оновлено ${result.updated}) за ${parsed.years.join(', ')} рр.`);
            }
            if (_loadSummaryFn) await _loadSummaryFn();
            showLoader(false);
            return;
        }

        // KPI file
        const parsed = await parseKpiFile(file);
        const records = parsed.records;
        if (!records.length) { toast('Файл не містить даних. Перевірте формат.', true); showLoader(false); return; }
        if (parsed.skippedIndicators.length) {
            console.warn('Невідомі індикатори пропущені:', parsed.skippedIndicators);
            toast(`Увага: пропущено невідомі індикатори: ${parsed.skippedIndicators.join(', ')}`);
        }
        if (parsed.skippedValues > 0) {
            console.warn('Пропущено рядків з невалідними значеннями:', parsed.skippedValues);
        }

        const result = await saveRecords(records, file.name);
        if (result.added === 0 && result.updated === 0) {
            toast('Файл не містить нових даних.');
        } else if (result.added === 0) {
            toast(`KPI: оновлено ${result.updated} існуючих записів`);
        } else {
            toast(`KPI: додано ${result.added} нових, оновлено ${result.updated} існуючих`);
        }
        if (_loadAndRenderFn) await _loadAndRenderFn();
    } catch (err) { toast('Помилка: ' + err.message, true); console.error(err); }
    showLoader(false);
}

async function handleDocxFile(buffer, fileName) {
    try {
        const parsed = await parseSummaryDocx(buffer);
        if (!parsed.records.length && !parsed.notes.length) {
            toast('Файл .docx не містить даних тижневої довідки. Перевірте формат.', true);
            return;
        }

        // Try to get date from document content, then filename, then today
        let reportDate = parsed.reportDate;
        if (!reportDate) {
            const fm = (fileName || '').match(/(\d{2})\.(\d{2})\.(20\d{2})/);
            if (fm) {
                // Filename date is "станом на" — subtract 1 day to get actual reporting week
                const d = new Date(`${fm[3]}-${fm[2]}-${fm[1]}T12:00:00`);
                d.setDate(d.getDate() - 1);
                reportDate = d.toISOString().slice(0, 10);
            } else {
                reportDate = new Date().toISOString().slice(0, 10);
                toast('Не вдалося визначити дату з документа. Використано поточну дату.', true);
            }
        }
        const result = await saveSummaryWeekly(parsed.records, parsed.notes, reportDate, fileName);
        if (result.added === 0 && result.updated === 0) {
            toast('Тижнева довідка: дані вже актуальні, змін не внесено.');
        } else {
            toast(`Тижнева довідка (${reportDate}): додано ${result.added}, оновлено ${result.updated} показників`);
        }

        if (_loadSummaryFn) await _loadSummaryFn();
    } catch (err) {
        toast('Помилка обробки .docx: ' + err.message, true);
        console.error(err);
    }
}
