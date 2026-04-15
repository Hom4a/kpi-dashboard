// ===== Indicators Master Config =====
// Single source of truth for monthly report indicators.
// YTD types: sum, avg, weighted, last, volprice, derived

// ===== TABLE 1: Основні показники =====
export const TABLE_1 = {
    title: 'Основні показники',
    id: 'monthly_t1',
    indicators: [
        { id: 'fin_coef', name: 'Коефіцієнт фінансової стійкості (станом на кінець кварталу)', ytd: 'last', format: 'text' },
        { id: 'fop', name: 'Фонд оплати праці, млн. грн', ytd: 'sum', bold: true },
        { id: 'headcount', name: 'Середньооблікова чисельність штатних працівників', ytd: 'avg' },
        { id: 'salary_avg', name: 'Середня заробітна плата штатного працівника, грн', ytd: 'weighted', weightBy: 'headcount' },
        { id: 'debt_debit', name: 'Дебіторська заборгованість, млн. грн', ytd: 'last' },
        { id: 'debt_credit', name: 'Кредиторська заборгованість, млн. грн', ytd: 'last' },
        { id: 'cash_balance', name: 'Залишок коштів на рахунках, млн. грн', ytd: 'last' },
        { id: 'arrears_budget', name: 'Недоїмка перед бюджетом, млн. грн', ytd: 'last' },
        { id: 'arrears_pf', name: 'Недоїмка перед ПФ, млн. грн', ytd: 'last' },
        { id: 'total_sales', name: 'Загальна реалізація, млн. грн', ytd: 'sum', bold: true },
        { id: 'sales_round', name: 'в т.ч: лісоматеріали в круглому вигляді, млн. грн', ytd: 'sum', sub: true },
        { id: 'sales_processed', name: 'продукція переробки, млн. грн', ytd: 'sum', sub: true },
        { id: 'sales_other', name: 'інша реалізація (послуги, побічне користування тощо), млн грн', ytd: 'sum', sub: true },
        { id: 'processing_vol', name: 'Обсяг переробки, всього, тис. м3', ytd: 'sum', bold: true },
        { id: 'processing_conifer', name: 'В т.ч: хвойні', ytd: 'sum', sub: true },
        { id: 'processing_oak', name: 'дуб', ytd: 'sum', sub: true },
        { id: 'processing_other', name: 'інші', ytd: 'sum', sub: true },
        { id: 'vol_round', name: 'Реалізація лісоматеріалів круглих, тис. м3', ytd: 'sum', bold: true },
        { id: 'price_round', name: 'Середня ціна реалізації 1 м3 лісоматеріалів круглих, грн/м3', ytd: 'weighted', weightBy: 'vol_round' },
        { id: 'vp_birch', name: 'В.т.ч: вільха, береза тис. м3/сер. ціна грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'vp_pine', name: 'сосна тис. м3/сер. ціна грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'vp_oak', name: 'дуб тис. м3/сер. ціна грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'vp_other', name: 'інші тис. м3/сер. ціна грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'vol_firewood_pv', name: "Реалізація деревини дров'яної ПВ тис. м3", ytd: 'sum' },
        { id: 'price_firewood_pv', name: 'Середня ціна реалізації 1 м3 деревини дровяної ПВ, грн/м3', ytd: 'weighted', weightBy: 'vol_firewood_pv' },
        { id: 'vol_firewood_np', name: "Реалізація деревини дров'яної НП тис. м3", ytd: 'sum' },
        { id: 'price_firewood_np', name: 'Середня ціна реалізації 1 м3 деревини дровяної НП, грн/м3', ytd: 'weighted', weightBy: 'vol_firewood_np' },
        { id: 'export_sales', name: 'Реалізовано на експорт, млн. грн', ytd: 'sum' },
        { id: 'vp_export_wood', name: 'У т.ч.: продукція переробки (дрова), м3/сер. ціна, грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'vp_export_chips', name: 'продукція переробки (тріска) м3(насипний)/сер. ціна, грн', ytd: 'volprice', sub: true, format: 'volprice' },
        { id: 'per_employee', name: 'Реалізовано на 1 штатного, грн', ytd: 'derived', derivedFormula: 'per_employee' },
        { id: 'harvest_total', name: 'Заготівля деревини, всього тис. м3', ytd: 'sum', bold: true },
        { id: 'harvest_main', name: 'Рубки головного користування', ytd: 'sum', sub: true },
        { id: 'harvest_shaping', name: 'Рубки формування і оздоровлення лісів', ytd: 'sum', sub: true },
        { id: 'price_avg_wood', name: 'Ціна знеособленого 1 м3 реалізованої деревини, грн.', ytd: 'derived', derivedFormula: 'avg_wood_price' },
        { id: 'reforestation', name: 'Лісовідновлення (га)', ytd: 'sum' },
        { id: 'afforestation', name: 'Лісорозведення (га)', ytd: 'sum' },
        { id: 'natural_regen', name: 'Сприяння природному поновленню (га)', ytd: 'sum' },
        { id: 'seedlings', name: 'Вирощування садивного матеріалу із закритою кореневою системою, млн шт.', ytd: 'text' },
    ]
};

// ===== TABLE 2: Податки та збори =====
export const TABLE_2 = {
    title: 'Податки та збори',
    id: 'monthly_t2',
    indicators: [
        { id: 'tax_total', name: 'Сплачено податків та зборів всього млн. грн.', ytd: 'sum', bold: true },
        { id: 'tax_esv', name: 'єдиний соціальний внесок млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_rent', name: 'рентна плата за спеціальне використання лісових ресурсів млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_vat', name: 'податок на додану вартість млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_profit', name: 'податок на прибуток млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_pdfo', name: 'ПДФО', ytd: 'sum', sub: true },
        { id: 'tax_vz', name: 'ВЗ', ytd: 'sum', sub: true },
        { id: 'tax_land', name: 'податок на лісові землі млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_dividends', name: 'дивіденди млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_other', name: 'інші млн. грн', ytd: 'sum', sub: true },
        { id: 'tax_arrears_budget', name: 'Недоїмка перед бюджетом млн. грн', ytd: 'last' },
        { id: 'tax_arrears_pf', name: 'Недоїмка перед ПФ млн. грн', ytd: 'last' },
        { id: 'tax_debt_debit', name: 'Дебіторська заборгованість млн. грн', ytd: 'last' },
        { id: 'tax_debt_credit', name: 'Кредиторська заборгованість млн. грн', ytd: 'last' },
        { id: 'tax_cash', name: 'Залишок коштів на рахунках млн. грн', ytd: 'last' },
    ]
};

// ===== SALARY TABLE =====
export const SALARY_TABLE = {
    title: 'Середня з/п по філіях одного штатного працівника, грн',
    id: 'monthly_salary',
    // Fixed order from Excel (rows 70-89 of summary sheet)
    order: [
        'Карпатський лісовий офіс',
        'Південний', 'Північний', 'Подільський', 'Поліський',
        'Слобожанський', 'Столичний', 'Східний', 'Центральний',
        'філія "Лісовий навчальний центр"',
        'філія "Лісові репродуктивні ресурси"',
        'філія "Східний лісовий офіс"',
        'філія "Південний лісовий офіс"',
        'Філія "Карпатський лісовий офіс"',
        'Філія "Подільський лісовий офіс"',
        'Філія "Північний лісовий офіс"',
        'Філія "Поліський лісовий офіс"',
        'Філія "Столичний лісовий офіс"',
        'Філія "Центральний лісовий офіс"',
        'Філія "Слобожанський лісовий офіс"',
    ]
};

// ===== ANIMALS & REFERENCE =====
export const ANIMALS_TABLE = {
    title: 'Чисельність / кількість лімітів тварин',
    id: 'monthly_animals',
    // Fixed order from Excel (row 44-49)
    order: ['Олень благор.', 'Олень плямистий', 'Козуля', 'Кабан', 'Лань', 'Муфлон']
};
export const REFERENCE_BLOCK = { title: 'Довідково', id: 'monthly_reference' };

// ===== Build lookup index =====
const _allIndicators = [...TABLE_1.indicators, ...TABLE_2.indicators];
const _byId = new Map(_allIndicators.map(i => [i.id, i]));

// Name lookup: normalized name → config
const _byName = new Map();
function _norm(s) { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }
for (const ind of _allIndicators) {
    _byName.set(_norm(ind.name), ind);
}

export function getById(id) { return _byId.get(id); }
export function getByName(name) { return _byName.get(_norm(name)); }
export { _norm as normalizeLookup };
