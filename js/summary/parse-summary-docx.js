// ===== Weekly Briefing DOCX Parser =====
// Parses "ДП Ліси України" weekly briefing documents (.docx)
// Extracts tables and text notes from word/document.xml

// Table index → section mapping (matches WEEKLY_SECTIONS keys in weekly-entry.js)
const TABLE_MAP = [
    { index: 0, section: 'kpi', cols: ['indicator', 'current', 'previous', 'ytd', 'delta'] },
    { index: 1, section: 'forest_protection', cols: ['indicator', 'ytd', 'current'] },
    { index: 2, section: 'raids', cols: ['indicator', 'ytd', 'current'] },
    { index: 3, section: 'mru_raids', cols: ['indicator', 'ytd', 'current'] },
    { index: 4, section: 'demining', cols: ['indicator', 'current'] },
    { index: 5, section: 'certification', cols: ['indicator', 'current', 'ytd', 'delta'] },
    { index: 6, section: 'land_self_forested', cols: ['indicator', 'all_time', 'ytd', 'current'] },
    { index: 7, section: 'land_reforestation', cols: ['indicator', 'all_time', 'ytd', 'current'] },
    { index: 8, section: 'land_reserves', cols: ['indicator', 'all_time', 'ytd', 'current'] },
    { index: 9, section: 'harvesting', cols: ['indicator', 'current'] },
    { index: 10, section: 'contracts', cols: ['indicator', 'current', 'ytd', 'delta'] },
    { index: 11, section: 'sales', cols: ['indicator', 'current'] },
    { index: 12, section: 'finance', cols: ['indicator', 'current', 'delta'] },
    { index: 13, section: 'personnel', cols: ['indicator', 'current'] },
    { index: 14, section: 'legal', cols: ['indicator', 'current'] },
    { index: 15, section: 'procurement', cols: ['indicator', 'current'] },
    { index: 16, section: 'zsu', cols: ['indicator', 'current'] },
];

// Note type detection from text sections
const NOTE_PATTERNS = [
    { type: 'general', pattern: /загальна оцінка/i },
    { type: 'events', pattern: /ключові події/i },
    { type: 'positive', pattern: /позитивна/i },
    { type: 'negative', pattern: /негативна|ризикова/i },
    { type: 'decisions', pattern: /питання.*рішення|управлінськ/i },
];

/**
 * Parse a .docx file buffer into weekly briefing records + notes
 * @param {ArrayBuffer} buffer - the raw .docx file content
 * @returns {Promise<{records: Array, notes: Array, reportDate: string|null}>}
 */
export async function parseSummaryDocx(buffer) {
    // Load JSZip dynamically if not available
    if (typeof JSZip === 'undefined') {
        await loadJSZip();
    }

    const zip = await JSZip.loadAsync(buffer);
    const xmlStr = await zip.file('word/document.xml').async('string');

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    // Extract report date from title/filename
    const reportDate = extractReportDate(doc, ns);

    // Extract all tables
    const tables = doc.getElementsByTagNameNS(ns, 'tbl');
    const records = [];

    for (let ti = 0; ti < tables.length && ti < TABLE_MAP.length; ti++) {
        const mapping = TABLE_MAP[ti];
        const tableRows = tables[ti].getElementsByTagNameNS(ns, 'tr');

        // Skip header row (index 0), parse data rows
        for (let ri = 1; ri < tableRows.length; ri++) {
            const cells = tableRows[ri].getElementsByTagNameNS(ns, 'tc');
            const values = {};
            let indicatorName = '';

            for (let ci = 0; ci < cells.length && ci < mapping.cols.length; ci++) {
                const colKey = mapping.cols[ci];
                const text = getCellText(cells[ci], ns);

                if (colKey === 'indicator') {
                    indicatorName = text;
                } else {
                    values[colKey] = parseNumericValue(text);
                }
            }

            if (!indicatorName) continue;

            records.push({
                section: mapping.section,
                indicator_name: indicatorName,
                value_current: values.current ?? null,
                value_previous: values.previous ?? null,
                value_ytd: values.ytd ?? null,
                value_delta: values.delta ?? null,
                value_text: values.all_time != null ? String(values.all_time) : null
            });
        }
    }

    // Extract text notes from paragraphs before first table
    const notes = extractNotes(doc, ns);

    console.log(`DOCX parser: ${records.length} indicators, ${notes.length} notes, date: ${reportDate}`);
    return { records, notes, reportDate };
}

/**
 * Extract text content from a table cell, joining all <w:t> elements
 */
function getCellText(tc, ns) {
    const texts = [];
    const tElements = tc.getElementsByTagNameNS(ns, 't');
    for (let i = 0; i < tElements.length; i++) {
        const t = tElements[i].textContent;
        if (t) texts.push(t);
    }
    return texts.join('').trim();
}

/**
 * Parse a numeric value from Ukrainian-format text
 * Handles: comma decimals, +/- prefixes, spaces in numbers, percentage
 */
function parseNumericValue(text) {
    if (!text || text === '-' || text === '—' || text === '–') return null;

    // Remove internal spaces (e.g., "21 328" → "21328", "137 996,8" → "137996,8")
    let s = text.replace(/[\s\u00A0]/g, '');

    // Remove + prefix but keep - for negative
    if (s.startsWith('+')) s = s.substring(1);

    // Remove % suffix
    s = s.replace(/%$/, '');

    // Replace comma with dot for decimal
    s = s.replace(',', '.');

    // Handle parenthesized values like "(85,3%)" → 85.3
    s = s.replace(/[()]/g, '');

    const num = parseFloat(s);
    return isNaN(num) ? null : num;
}

/**
 * Extract report date from document content
 * Looks for patterns like "02.03.2026" in the first few paragraphs
 */
function extractReportDate(doc, ns) {
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');
    for (let i = 0; i < Math.min(15, paragraphs.length); i++) {
        const texts = paragraphs[i].getElementsByTagNameNS(ns, 't');
        let fullText = '';
        for (let j = 0; j < texts.length; j++) {
            fullText += texts[j].textContent || '';
        }

        // Remove internal spaces that may appear between date parts (e.g., "02 .03 .2026")
        const cleaned = fullText.replace(/\s+/g, ' ');

        // Match date patterns: DD.MM.YYYY (with optional spaces around dots)
        const m = cleaned.match(/(\d{2})\s*\.\s*(\d{2})\s*\.\s*(20\d{2})/);
        if (m) {
            return `${m[3]}-${m[2]}-${m[1]}`; // ISO format
        }
    }
    return null;
}

/**
 * Extract text notes (загальна оцінка, ключові події, etc.) from paragraphs
 */
function extractNotes(doc, ns) {
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');
    const notes = [];
    let currentType = null;
    let currentContent = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const texts = paragraphs[i].getElementsByTagNameNS(ns, 't');
        let fullText = '';
        for (let j = 0; j < texts.length; j++) {
            fullText += texts[j].textContent || '';
        }
        fullText = fullText.trim();
        if (!fullText) continue;

        // Check if this is a section header for notes
        const isBold = paragraphs[i].getElementsByTagNameNS(ns, 'b').length > 0;

        // Check if this paragraph starts a new note type
        let matchedType = null;
        for (const np of NOTE_PATTERNS) {
            if (np.pattern.test(fullText)) {
                matchedType = np.type;
                break;
            }
        }

        if (matchedType) {
            // Save previous note
            if (currentType && currentContent.length) {
                notes.push({ note_type: currentType, content: currentContent.join('\n').trim() });
            }
            currentType = matchedType;
            currentContent = [];

            // If the header line itself contains content after the label, capture it
            // e.g., "Загальна оцінка тижня: позитивна динаміка..."
            const colonIdx = fullText.indexOf(':');
            if (colonIdx >= 0) {
                const after = fullText.substring(colonIdx + 1).trim();
                if (after) currentContent.push(after);
            }
        } else if (currentType) {
            // Stop collecting when we hit a table or a new Roman numeral section
            if (/^[ІIVX]+\.\s/.test(fullText) || /^ІІ\.|^ІІІ\.|^IV\.|^V\.|^VI\./i.test(fullText)) {
                if (currentContent.length) {
                    notes.push({ note_type: currentType, content: currentContent.join('\n').trim() });
                }
                currentType = null;
                currentContent = [];
            } else if (!isBold || currentContent.length === 0) {
                // Continue collecting content (skip bold sub-headers if we already have content)
                currentContent.push(fullText);
            }
        }
    }

    // Save last note
    if (currentType && currentContent.length) {
        notes.push({ note_type: currentType, content: currentContent.join('\n').trim() });
    }

    return notes;
}

/**
 * Dynamically load JSZip from CDN
 */
function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (typeof JSZip !== 'undefined') { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load JSZip'));
        document.head.appendChild(script);
    });
}
