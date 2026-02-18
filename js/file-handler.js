// ===== File Handling & Auto-Detection =====
import { $, showLoader, toast } from './utils.js';
import { currentProfile } from './state.js';
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

let _loadAndRenderFn = null;
let _loadForestFn = null;
let _loadHarvestingFn = null;
let _loadMarketFn = null;
export function setLoadAndRenderCallback(fn) { _loadAndRenderFn = fn; }
export function setLoadForestCallback(fn) { _loadForestFn = fn; }
export function setLoadHarvestingCallback(fn) { _loadHarvestingFn = fn; }
export function setLoadMarketCallback(fn) { _loadMarketFn = fn; }

const MARKET_COUNTRIES = ['україна', 'фінляндія', 'німеччина', 'польща', 'латвія', 'литва', 'швеція', 'норвегія', 'естонія', 'австрія'];

export function detectFileType(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: true });
    let countryHits = 0;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
        const row = (rows[i] || []).map(c => (c || '').toString().toLowerCase());
        const joined = row.join(' ');
        if (joined.includes('ціна за 1 м3') || joined.includes('ціна за 1 м³') ||
            (joined.includes('країна') && (joined.includes('сосна') || joined.includes('ялина')) && joined.includes('дуб'))) return 'market_prices';
        if (joined.includes('середньозважен') || (joined.includes('вартість') && joined.includes('продукція'))) return 'prices';
        if (joined.includes('залишок') || joined.includes('надлісництво')) return 'inventory';
        if (joined.includes('виконання планових') || joined.includes('планових показників') || (joined.includes('річн') && joined.includes('план') && joined.includes('заготів'))) return 'harvesting_plan_fact';
        if (joined.includes('вилучення') || (joined.includes('лісопродукції') && joined.includes('зсу'))) return 'harvesting_zsu';
        // Count known country mentions for broader market detection
        MARKET_COUNTRIES.forEach(c => { if (joined.includes(c)) countryHits++; });
    }
    // If 3+ country names found in first 15 rows — likely a market prices file
    if (countryHits >= 3) return 'market_prices';
    // Also check sheet names for "ціни" / "prices" keyword
    if (wb.SheetNames.some(n => /ціни|prices/i.test(n))) return 'market_prices';
    return 'kpi';
}

export async function handleFile(file) {
    const role = currentProfile ? currentProfile.role : 'viewer';
    if (role !== 'admin' && role !== 'editor') { toast('У вас немає прав для завантаження даних', true); return; }
    showLoader(true);
    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const fileType = detectFileType(wb);

        if (fileType === 'market_prices') {
            const parsed = parseMarketPricesFile(wb);
            const total = parsed.prices.length + parsed.uaDetail.length + parsed.history.length + parsed.eurRates.length;
            if (!total) { toast('Файл не містить числових даних для імпорту.'); showLoader(false); return; }
            const result = await saveMarketData(parsed, file.name);
            toast(`Ринкові ціни завантажено: ${result.count} записів`);
            if (_loadMarketFn) await _loadMarketFn();
            showLoader(false);
            return;
        }

        if (fileType === 'prices') {
            const records = parsePricesFile(wb);
            if (!records.length) { toast('Файл не містить даних про ціни. Перевірте формат.', true); showLoader(false); return; }
            const result = await savePricesData(records, file.name);
            toast(`Ціни завантажено: ${result.count} записів`);
            if (_loadForestFn) await _loadForestFn();
            showLoader(false);
            return;
        }

        if (fileType === 'inventory') {
            const records = parseInventoryFile(wb);
            if (!records.length) { toast('Файл не містить даних про залишки. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveInventoryData(records, file.name);
            toast(`Залишки завантажено: ${result.count} записів`);
            if (_loadForestFn) await _loadForestFn();
            showLoader(false);
            return;
        }

        if (fileType === 'harvesting_plan_fact') {
            const records = parsePlanFactFile(wb);
            if (!records.length) { toast('Файл не містить даних план-факт. Перевірте формат.', true); showLoader(false); return; }
            const result = await savePlanFactData(records, file.name);
            toast(`План-факт завантажено: ${result.count} записів`);
            if (_loadHarvestingFn) await _loadHarvestingFn();
            showLoader(false);
            return;
        }

        if (fileType === 'harvesting_zsu') {
            const records = parseZsuFile(wb);
            if (!records.length) { toast('Файл не містить даних ЗСУ. Перевірте формат.', true); showLoader(false); return; }
            const result = await saveZsuData(records, file.name);
            toast(`Дані ЗСУ завантажено: ${result.count} записів`);
            if (_loadHarvestingFn) await _loadHarvestingFn();
            showLoader(false);
            return;
        }

        // KPI file
        const records = await parseKpiFile(file);
        if (!records.length) { toast('Файл не містить даних. Перевірте формат.', true); showLoader(false); return; }

        const result = await saveRecords(records, file.name);
        if (result.added === 0) {
            toast(`Нових даних не знайдено. ${result.skipped} записів вже існують в базі.`);
        } else {
            toast(`Додано ${result.added} нових записів, ${result.skipped} вже існують`);
        }
        if (_loadAndRenderFn) await _loadAndRenderFn();
    } catch (err) { toast('Помилка: ' + err.message, true); console.error(err); }
    showLoader(false);
}
