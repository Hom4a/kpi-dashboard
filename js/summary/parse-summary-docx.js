// ===== Weekly Briefing DOCX Parser =====
// Parses "ДП Ліси України" weekly briefing documents (.docx)
// Extracts tables and text notes from word/document.xml

// Smart table detection: identify section by keywords, detect columns from headers
const SECTION_SIGS = [
    { section: 'kpi',                 header: /попередній тиждень/i },
    { section: 'forest_protection',   data:   /кількість випадків/i },
    { section: 'raids',               data:   /кількість рейдів(?!.*шт)/i },
    { section: 'mru_raids',           data:   /кількість рейдів.*шт/i },
    { section: 'fires',               data:   /кількість\s*пожеж/i },
    { section: 'forestry_campaign',   data:   /площа створених/i },
    { section: 'demining',            header: /площа.*тис.*га/i },
    { section: 'certification',       header: /надлісництва/i },
    { section: 'land_self_forested',  data:   /надіслано клопотань/i, seq: 0 },
    { section: 'land_reforestation',  data:   /надіслано клопотань/i, seq: 1 },
    { section: 'land_reserves',       data:   /подано клопотань/i },
    { section: 'harvesting',          data:   /заготівл[яі]|загальні залишки/i },
    { section: 'harvesting_extra',    data:   /частка лісосічного|залишки круглих/i },
    { section: 'contracts',           header: /тип.*обсяг|обсяг.*млн\s*м/i },
    { section: 'sales',               data:   /реалізовано з початку|реалізація деревини/i },
    { section: 'finance',             data:   /залишки коштів/i },
    { section: 'personnel',           data:   /облікова чисельність/i },
    { section: 'legal',               data:   /загальна площа земель/i },
    { section: 'procurement',         data:   /процедури з початку/i },
    { section: 'zsu',                 data:   /допомога з початку/i },
];

function identifyTable(headerText, firstRowText) {
    const h = headerText.toLowerCase().replace(/\s+/g, ' ');
    const d = firstRowText.toLowerCase().replace(/\s+/g, ' ');
    for (const sig of SECTION_SIGS) {
        if (sig._matched && sig.section !== 'harvesting') continue; // harvesting can have 2 tables
        const hOk = !sig.header || sig.header.test(h);
        const dOk = !sig.data || sig.data.test(d);
        if (hOk && dOk) {
            if (sig.seq != null) {
                // Sequential matching: first match → seq=0, second → seq=1
                const seqKey = `_seq_${sig.data}`;
                identifyTable[seqKey] = (identifyTable[seqKey] || 0);
                if (identifyTable[seqKey] !== sig.seq) { identifyTable[seqKey]++; continue; }
                identifyTable[seqKey]++;
            }
            sig._matched = true;
            return sig;
        }
    }
    return null;
}

// Note type detection from text sections
const NOTE_PATTERNS = [
    { type: 'general', pattern: /загальна оцінка/i },
    { type: 'events', pattern: /ключові події/i },
    { type: 'positive', pattern: /позитивна/i },
    { type: 'negative', pattern: /негативна|ризикова/i },
    { type: 'decisions', pattern: /питання.*рішення|управлінськ/i },
    { type: 'other', pattern: /виконання протокольних|[ХX][ІI]V[\.\s]/i },
];

/**
 * Universal column detection from header cells.
 * Handles all template versions (v1: 17 tables, v2: 19, v3: 20+).
 * %Δ columns → _skip (delta calculated in dashboard, not from Word).
 */
function detectCols(headerRow, ns) {
    const headerCells = headerRow.getElementsByTagNameNS(ns, 'tc');
    const cols = [];
    for (let ci = 0; ci < headerCells.length; ci++) {
        const t = getCellText(headerCells[ci], ns).toLowerCase().replace(/\s+/g, ' ');
        if (t.includes('показник') || t.includes('тип') || t.includes('система')) cols.push('indicator');
        else if (t.includes('попередній')) cols.push('previous');
        else if (t.includes('з початку') || t.includes('з поч')) cols.push('ytd');
        else if (t.includes('за тиждень') || t.includes('за звітний')) cols.push('current');
        else if (t.includes('аналогічний період') || t.includes('попередньог')) cols.push('yoy');
        else if (t.includes('весь період')) cols.push('all_time');
        else if (t.includes('значення')) cols.push('current');
        else if (t.includes('виконання')) cols.push('delta');
        else if (t.includes('∆') || t.includes('δ') || t.includes('%')) cols.push('_skip');
        else if (t.includes('площа') && t.includes('тис')) cols.push('current');
        else if (t.includes('площа') && t.includes('млн')) cols.push('current');
        else if (t.includes('надлісництва')) cols.push('current');
        else if (t.includes('частка')) cols.push('delta');
        else if (t.includes('обсяг')) cols.push('current');
        else if (t.includes('сума')) cols.push('ytd');
        else if (t.includes('план') || t.includes('орієнтир') || t.includes('статус')) cols.push('_skip');
        else cols.push('current'); // fallback
    }
    if (!cols.includes('indicator')) cols.unshift('indicator');
    return cols;
}

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

    // Extract all tables — identify each by header/data keywords
    const tables = doc.getElementsByTagNameNS(ns, 'tbl');
    const records = [];

    // Reset sequential matching state
    for (const sig of SECTION_SIGS) { sig._matched = false; }
    for (const k of Object.keys(identifyTable)) { if (k.startsWith('_seq_')) delete identifyTable[k]; }

    for (let ti = 0; ti < tables.length; ti++) {
        const tableRows = tables[ti].getElementsByTagNameNS(ns, 'tr');
        if (tableRows.length < 2) continue;

        // Get header + first data row text for identification
        const headerText = getCellText(tableRows[0], ns, true);
        const firstDataText = tableRows.length > 1 ? getCellText(tableRows[1], ns, true) : '';
        const mapping = identifyTable(headerText, firstDataText);
        if (!mapping) {
            console.log(`DOCX parser: skipping unknown table ${ti}: "${headerText.slice(0, 60)}" / "${firstDataText.slice(0, 60)}"`);
            continue;
        }
        // Universal column detection from header row (all tables)
        const cols = detectCols(tableRows[0], ns);
        console.log(`DOCX parser: table ${ti} → ${mapping.section} (cols: ${cols.join(',')})`);

        // Skip header row (index 0), parse data rows
        const sectionNameCount = {}; // Track duplicate indicator names within section
        for (let ri = 1; ri < tableRows.length; ri++) {
            const cells = tableRows[ri].getElementsByTagNameNS(ns, 'tc');
            const values = {};
            const rawTexts = {};
            let indicatorName = '';

            for (let ci = 0; ci < cells.length && ci < cols.length; ci++) {
                const colKey = cols[ci];
                const text = getCellText(cells[ci], ns);

                if (colKey === 'indicator') {
                    indicatorName = text;
                } else if (colKey === '_skip') {
                    continue;
                } else {
                    values[colKey] = parseNumericValue(text);
                    // FIX #9: preserve raw text for cells with brackets/percentages
                    if (/\(.*[%\d].*\)/.test(text)) rawTexts[colKey] = text;
                }
            }

            if (!indicatorName) continue;

            // FIX #10: deduplicate indicator names (e.g. two "Сума, млн грн" in procurement)
            const nameKey = `${mapping.section}|${indicatorName}`;
            sectionNameCount[nameKey] = (sectionNameCount[nameKey] || 0) + 1;
            if (sectionNameCount[nameKey] > 1) {
                indicatorName = `${indicatorName} (${sectionNameCount[nameKey]})`;
            }

            // Determine value_text: prioritize all_time, then raw text with brackets
            let valueText = values.all_time != null ? String(values.all_time) : null;
            if (!valueText && rawTexts.current) valueText = rawTexts.current;

            records.push({
                section: mapping.section,
                indicator_name: indicatorName,
                value_current: values.current ?? null,
                value_previous: values.previous ?? null,
                value_ytd: values.ytd ?? null,
                value_delta: values.delta ?? null,
                value_text: valueText,
                sort_order: records.length
            });
        }
    }

    // Extract text notes (Block I) from paragraphs
    const notes = extractNotes(doc, ns);

    // FIX #4: Extract section-level text (comments between/after tables)
    const sectionTexts = extractSectionTexts(doc, ns);
    for (const st of sectionTexts) {
        notes.push({ note_type: `section_${st.section}`, content: st.content });
    }

    console.log(`DOCX parser: ${records.length} indicators, ${notes.length} notes, date: ${reportDate}`);
    return { records, notes, reportDate };
}

/**
 * Extract text content from a table cell, joining all <w:t> elements
 */
function getCellText(el, ns, joinAll) {
    if (joinAll) {
        // Join ALL <w:t> in the element (used for rows — get all cell texts combined)
        const texts = [];
        const tElements = el.getElementsByTagNameNS(ns, 't');
        for (let i = 0; i < tElements.length; i++) {
            const t = tElements[i].textContent;
            if (t) texts.push(t);
        }
        return texts.join(' ').trim();
    }
    const texts = [];
    const tElements = el.getElementsByTagNameNS(ns, 't');
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

    // If text has "number (percentage%)" pattern like "5912850 (85,8%)"
    // → parse ONLY the number before the bracket
    const bracketMatch = text.match(/^([+\-]?[\d\s\u00A0,.]+)\s*\(/);
    if (bracketMatch) {
        let s = bracketMatch[1].replace(/[\s\u00A0]/g, '').replace(',', '.');
        if (s.startsWith('+')) s = s.substring(1);
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
    }

    let s = text.replace(/[\s\u00A0]/g, '');
    if (s.startsWith('+')) s = s.substring(1);
    s = s.replace(/%$/, '');
    s = s.replace(',', '.');
    s = s.replace(/[()]/g, '');

    const num = parseFloat(s);
    return isNaN(num) ? null : num;
}

/**
 * Extract report date from document content
 * Looks for patterns like "02.03.2026" in the first few paragraphs
 */
function normalizeYear(y) {
    return y.length === 2 ? '20' + y : y;
}

function extractReportDate(doc, ns) {
    // Collect all text from first 30 paragraphs into one string
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');
    let allText = '';
    for (let i = 0; i < Math.min(30, paragraphs.length); i++) {
        const texts = paragraphs[i].getElementsByTagNameNS(ns, 't');
        let pText = '';
        for (let j = 0; j < texts.length; j++) {
            pText += texts[j].textContent || '';
        }
        allText += pText + ' ';
    }
    const cleaned = allText.replace(/\s+/g, ' ');

    // Priority 1: "станом на DD.MM.YY(YY)" — date is AFTER the reporting period, subtract 1 day
    const mStanom = cleaned.match(/станом\s+на\s+(\d{2})\s*\.\s*(\d{2})\s*\.\s*(\d{2,4})/i);
    if (mStanom) {
        const d = new Date(`${normalizeYear(mStanom[3])}-${mStanom[2]}-${mStanom[1]}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    // Priority 2: "по DD.MM.YY(YY)" (end of date range — take the last date)
    const mRange = cleaned.match(/по\s+(\d{2})\s*\.\s*(\d{2})\s*\.\s*(\d{2,4})/i);
    if (mRange) return `${normalizeYear(mRange[3])}-${mRange[2]}-${mRange[1]}`;

    // Priority 3: any DD.MM.YY(YY) pattern
    const m = cleaned.match(/(\d{2})\s*\.\s*(\d{2})\s*\.\s*(\d{2,4})/);
    if (m) return `${normalizeYear(m[3])}-${m[2]}-${m[1]}`;

    return null;
}

/**
 * Extract text notes (загальна оцінка, ключові події, etc.) from paragraphs
 */
function isInsideTable(el) {
    let node = el.parentNode;
    while (node) {
        if (node.localName === 'tbl') return true;
        node = node.parentNode;
    }
    return false;
}

// FIX #4: Extract section-level text (analytical comments between tables)
const SECTION_HEADERS = [
    { pattern: /ОХОРОНА\s*ТА\s*ЗАХИСТ/i, section: 'forest_protection' },
    { pattern: /ЛІСОКУЛЬТУРНА/i, section: 'forestry_campaign' },
    { pattern: /РОЗМІНУВАННЯ/i, section: 'demining' },
    { pattern: /СЕРТИФІКАЦІЯ/i, section: 'certification' },
    { pattern: /ЗЕМЕЛЬНІ\s*ПИТАННЯ/i, section: 'land' },
    { pattern: /ЗАГОТІВЛЯ/i, section: 'harvesting' },
    { pattern: /РЕАЛІЗАЦІЯ\s*ТА\s*ДОГОВОРИ/i, section: 'sales' },
    { pattern: /ФІНАНСОВИЙ/i, section: 'finance' },
    { pattern: /ПЕРСОНАЛ/i, section: 'personnel' },
    { pattern: /ПРАВОВІ/i, section: 'legal' },
    { pattern: /ЗАКУПІВЛІ/i, section: 'procurement' },
    { pattern: /ДОПОМОГА\s*ЗСУ/i, section: 'zsu' },
];

function extractSectionTexts(doc, ns) {
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');
    const results = [];
    let currentSection = null;
    let currentText = [];

    for (let i = 0; i < paragraphs.length; i++) {
        if (isInsideTable(paragraphs[i])) continue;
        const texts = paragraphs[i].getElementsByTagNameNS(ns, 't');
        let fullText = '';
        for (let j = 0; j < texts.length; j++) fullText += texts[j].textContent || '';
        fullText = fullText.trim();
        if (!fullText) continue;

        // Check if this is a section header
        let matchedSection = null;
        for (const sh of SECTION_HEADERS) {
            if (sh.pattern.test(fullText)) { matchedSection = sh.section; break; }
        }

        if (matchedSection) {
            // Save previous section text
            if (currentSection && currentText.length) {
                results.push({ section: currentSection, content: currentText.join('\n').trim() });
            }
            currentSection = matchedSection;
            currentText = [];
        } else if (currentSection) {
            // Skip Block I note patterns
            if (/загальна оцінка|ключові події|позитивна|негативна|ризикова|питання.*рішення/i.test(fullText)) continue;
            // Skip Roman numeral headers
            if (/^[ІIVXХX]{1,4}\.\s/i.test(fullText)) {
                if (currentText.length) {
                    results.push({ section: currentSection, content: currentText.join('\n').trim() });
                }
                currentSection = null;
                currentText = [];
                continue;
            }
            currentText.push(fullText);
        }
    }
    if (currentSection && currentText.length) {
        results.push({ section: currentSection, content: currentText.join('\n').trim() });
    }

    // Filter: only keep sections with actual text (not just table data repeated)
    return results.filter(r => r.content.length > 20);
}

function extractNotes(doc, ns) {
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');
    const notes = [];
    let currentType = null;
    let currentContent = [];

    for (let i = 0; i < paragraphs.length; i++) {
        // Skip paragraphs inside tables — they contain data, not notes
        if (isInsideTable(paragraphs[i])) continue;

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

            // For section XIV ('other'), capture full paragraph text (minus the Roman numeral header)
            if (matchedType === 'other') {
                const cleaned = fullText.replace(/^[ХXІIVX]+\.\s*/i, '').trim();
                if (cleaned) currentContent.push(cleaned);
            } else {
                // For other notes: capture text after colon if present
                const colonIdx = fullText.indexOf(':');
                if (colonIdx >= 0) {
                    const after = fullText.substring(colonIdx + 1).trim();
                    if (after) currentContent.push(after);
                }
            }
        } else if (currentType) {
            // Stop collecting when we hit a new Roman numeral section (Latin + Cyrillic)
            if (/^[ІIVXХX]+\.\s/.test(fullText) || /^[ІIVXХX]+\./i.test(fullText)) {
                if (currentContent.length) {
                    notes.push({ note_type: currentType, content: currentContent.join('\n').trim() });
                }
                currentType = null;
                currentContent = [];
            } else if (currentType === 'other' || !isBold || currentContent.length === 0) {
                // Collect all content; for 'other' (XIV) — include bold sub-headers too
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
