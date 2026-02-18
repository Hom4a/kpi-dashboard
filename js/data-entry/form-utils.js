// ===== Form Utilities: Validation, Computed Fields, Autosave =====

// ===== Validation =====

export function validateRecord(schema, record) {
    const errors = [];
    for (const field of schema) {
        const val = record[field.name];
        if (field.required && (val === undefined || val === null || val === '')) {
            errors.push({ field: field.name, message: `${field.label} є обов'язковим` });
            continue;
        }
        if (val === undefined || val === null || val === '') continue;

        if (field.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) {
                errors.push({ field: field.name, message: `${field.label} має бути числом` });
            } else if (field.min !== undefined && num < field.min) {
                errors.push({ field: field.name, message: `${field.label} мінімум ${field.min}` });
            } else if (field.max !== undefined && num > field.max) {
                errors.push({ field: field.name, message: `${field.label} максимум ${field.max}` });
            }
        }
        if (field.type === 'date' && val) {
            if (isNaN(Date.parse(val))) {
                errors.push({ field: field.name, message: `${field.label} — невірний формат дати` });
            }
        }
        if (field.type === 'select' && field.options && val) {
            if (!field.options.includes(val)) {
                errors.push({ field: field.name, message: `${field.label} — невірне значення` });
            }
        }
    }
    return errors;
}

// ===== Computed Fields =====

export function computeFields(schema, record) {
    const result = { ...record };
    for (const field of schema) {
        if (field.type === 'computed' && field.formula) {
            try {
                result[field.name] = evaluateFormula(field.formula, result);
            } catch (e) {
                result[field.name] = null;
            }
        }
    }
    return result;
}

function evaluateFormula(formula, record) {
    // Simple formula: field_a * field_b, field_a + field_b, etc.
    // Replace field names with values, then evaluate
    let expr = formula;
    const fieldNames = Object.keys(record).sort((a, b) => b.length - a.length);
    for (const name of fieldNames) {
        const val = Number(record[name]) || 0;
        expr = expr.replace(new RegExp('\\b' + name + '\\b', 'g'), val);
    }
    // Only allow safe mathematical expressions
    if (/^[\d\s+\-*/().]+$/.test(expr)) {
        return Function('"use strict"; return (' + expr + ')')();
    }
    return null;
}

// ===== Autosave (localStorage) =====

const DRAFT_PREFIX = 'de_draft_';

export function saveDraft(typeId, records) {
    try {
        localStorage.setItem(DRAFT_PREFIX + typeId, JSON.stringify({
            records,
            savedAt: new Date().toISOString()
        }));
    } catch (e) { /* localStorage full — ignore */ }
}

export function loadDraft(typeId) {
    try {
        const raw = localStorage.getItem(DRAFT_PREFIX + typeId);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return draft;
    } catch (e) { return null; }
}

export function clearDraft(typeId) {
    localStorage.removeItem(DRAFT_PREFIX + typeId);
}

// ===== Schema Helpers =====

export function getDefaultRecord(schema) {
    const record = {};
    for (const field of schema) {
        if (field.default !== undefined) {
            record[field.name] = field.default;
        } else if (field.type === 'number') {
            record[field.name] = '';
        } else if (field.type === 'date') {
            record[field.name] = new Date().toISOString().split('T')[0];
        } else if (field.type === 'checkbox') {
            record[field.name] = false;
        } else {
            record[field.name] = '';
        }
    }
    return record;
}

export function formatFieldValue(field, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (field.type === 'number') {
        const n = Number(value);
        return isNaN(n) ? value : n.toLocaleString('uk-UA');
    }
    if (field.type === 'date') {
        try { return new Date(value).toLocaleDateString('uk-UA'); } catch { return value; }
    }
    if (field.type === 'checkbox') return value ? 'Так' : 'Ні';
    return String(value);
}

// ===== Icon Map =====

export const ICON_MAP = {
    'bar-chart': '<svg viewBox="0 0 24 24"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>',
    'dollar-sign': '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    'package': '<svg viewBox="0 0 24 24"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
    'target': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    'shield': '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'users': '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    'clock': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'credit-card': '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    'table': '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    'edit': '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    'plus': '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
};
