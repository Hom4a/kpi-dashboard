// ===== Data Validation & Normalization =====
// Canonical reference lists for data quality

// Canonical wood species (порода)
export const CANONICAL_SPECIES = {
    'сосна': 'Сосна', 'ялина': 'Ялина', 'дуб': 'Дуб',
    'береза': 'Береза', 'вільха': 'Вільха', 'бук': 'Бук',
    'дрова': 'Дрова', 'граб': 'Граб', 'ясен': 'Ясен',
    'липа': 'Липа', 'осика': 'Осика', 'клен': 'Клен',
    'акація': 'Акація', 'тополя': 'Тополя', 'модрина': 'Модрина'
};

// Canonical regional offices (управління)
const OFFICE_MAP = [
    { key: 'карпатськ', canonical: 'Карпатська ЛО' },
    { key: 'південн', canonical: 'Південна ЛО' },
    { key: 'північн', canonical: 'Північна ЛО' },
    { key: 'подільськ', canonical: 'Подільська ЛО' },
    { key: 'поліськ', canonical: 'Поліська ЛО' },
    { key: 'слобожанськ', canonical: 'Слобожанська ЛО' },
    { key: 'столичн', canonical: 'Столична ЛО' },
    { key: 'центральн', canonical: 'Центральна ЛО' },
    { key: 'східн', canonical: 'Східна ЛО' }
];

// Canonical quality classes
export const CANONICAL_QUALITY = {
    'а': 'A', 'a': 'A', 'б': 'B', 'b': 'B', 'в': 'C', 'c': 'C', 'с': 'C',
    'д': 'D', 'd': 'D', '1': '1', '2': '2', '3': '3', '4': '4'
};

/**
 * Normalize species name to canonical form
 * @param {string} raw - Raw species name from Excel
 * @returns {string} - Canonical form or trimmed original if unknown
 */
export function normalizeSpecies(raw) {
    if (!raw) return '';
    const lower = raw.toString().trim().toLowerCase();
    // Exact match
    if (CANONICAL_SPECIES[lower]) return CANONICAL_SPECIES[lower];
    // Partial match (e.g., "сосна звичайна" → "Сосна")
    for (const [key, canonical] of Object.entries(CANONICAL_SPECIES)) {
        if (lower.startsWith(key) || lower.includes(key)) return canonical;
    }
    // Return trimmed original if no match (preserve data)
    return raw.toString().trim();
}

/**
 * Normalize regional office name to canonical form
 * @param {string} raw - Raw office name from Excel
 * @returns {string|null} - Canonical name or null if not recognized
 */
export function normalizeOffice(raw) {
    if (!raw) return null;
    const lower = raw.toString().trim().toLowerCase();
    for (const { key, canonical } of OFFICE_MAP) {
        if (lower.includes(key)) return canonical;
    }
    return null;
}

/**
 * Check if a string matches a known office
 * @param {string} raw
 * @returns {boolean}
 */
export function isKnownOffice(raw) {
    return normalizeOffice(raw) !== null;
}

/**
 * Normalize quality class
 * @param {string} raw
 * @returns {string}
 */
export function normalizeQuality(raw) {
    if (!raw) return '';
    const lower = raw.toString().trim().toLowerCase();
    return CANONICAL_QUALITY[lower] || raw.toString().trim();
}

/**
 * Normalize product name — remove EN suffixes, standardize
 */
export function normalizeProduct(name) {
    if (!name) return 'Інше';
    let n = name.toString().trim();
    // Remove trailing " EN" suffix (e.g., "Круглі лісоматеріали EN" → "Круглі лісоматеріали")
    n = n.replace(/\s+EN$/i, '');
    return n;
}

/**
 * Normalize warehouse name — standardize dashes, map aliases
 */
const WAREHOUSE_ALIASES = {
    'франко-ліс': 'Верхній склад',
    'франко-трель': 'Верхній склад',
    'франко - ліс': 'Верхній склад',
    'франко – ліс': 'Верхній склад',
    'франко-проміжний': 'Проміжний склад',
    'франко - проміжний': 'Проміжний склад',
    'франко – проміжний': 'Проміжний склад'
};

export function normalizeWarehouse(name) {
    if (!name) return 'Інше';
    const lower = name.toString().trim().toLowerCase();
    if (WAREHOUSE_ALIASES[lower]) return WAREHOUSE_ALIASES[lower];
    // Standardize dashes
    return name.toString().trim().replace(/\s*[–—]\s*/g, '-');
}

/**
 * Map product name to full display name
 */
const PRODUCT_DISPLAY_NAMES = {
    'ділова довгомірна': 'Ділова деревина довгомірна',
    'дров. деревина': 'Деревина дров\'яна',
    'дрова': 'Деревина дров\'яна',
    'деревина дров\'яна нп': 'Деревина дров\'яна НП',
    'деревина дров\'яна пв': 'Деревина дров\'яна ПВ',
    'круглі лісоматеріали': 'Круглі лісоматеріали'
};

export function displayProduct(name) {
    if (!name) return 'Інше';
    const n = normalizeProduct(name);
    const lower = n.toLowerCase();
    return PRODUCT_DISPLAY_NAMES[lower] || n;
}
