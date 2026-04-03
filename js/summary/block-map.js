// ===== Block Mapping: 17 sections → 13+1 blocks (TZ structure) =====
// Presentation-layer only — DB section keys remain unchanged

export const WEEKLY_BLOCKS = [
    {
        id: 'I', roman: 'I', name: 'Загальна інформація',
        sections: [], isText: true,
        noteTypes: ['general', 'events', 'positive', 'negative'],
        subBlocks: [
            { id: 'I_decisions', name: 'Питання, що потребують управлінського рішення',
              noteType: 'decisions', isStructured: true,
              structuredColumns: ['Питання', 'Суть', 'Пропозиція', 'Адресат', 'Строк'] }
        ]
    },
    { id: 'II',   roman: 'II',   name: 'Ключові показники (КРІ)',    sections: ['kpi'],
      columns: ['indicator', 'current', 'delta_pct', 'previous', 'ytd'] },
    { id: 'III',  roman: 'III',  name: 'Охорона та захист лісів',     sections: ['forest_protection', 'raids', 'mru_raids', 'fires'],
      columns: ['indicator', 'current', 'delta_pct', 'previous', 'ytd'] },
    { id: 'III_FC', roman: 'IV', name: 'Лісокультурна кампанія',    sections: ['forestry_campaign'],
      columns: ['indicator', 'current', 'delta_pct', 'previous', 'ytd'] },
    { id: 'IV',   roman: 'V',   name: 'Розмінування лісових земель', sections: ['demining'],
      columns: ['indicator', 'area'] },
    { id: 'V',    roman: 'V',    name: 'Лісова сертифікація',         sections: ['certification'],
      columns: ['indicator', 'count', 'area_mln', 'share'] },
    { id: 'VI',   roman: 'VI',   name: 'Земельні питання',            sections: ['land_self_forested', 'land_reforestation', 'land_reserves'],
      columns: ['indicator', 'total', 'ytd', 'current'] },
    { id: 'VII',  roman: 'VII',  name: 'Заготівля та лісові ресурси', sections: ['harvesting'],
      columns: ['indicator', 'value'] },
    { id: 'VIII', roman: 'VIII', name: 'Реалізація та договори',      sections: ['contracts', 'sales'] },
    { id: 'IX',   roman: 'IX',   name: 'Фінансовий стан',             sections: ['finance'],
      columns: ['indicator', 'value', 'delta_pct'] },
    { id: 'X',    roman: 'X',    name: 'Персонал',                    sections: ['personnel'],
      columns: ['indicator', 'value'] },
    { id: 'XI',   roman: 'XI',   name: 'Правові питання',             sections: ['legal'],
      columns: ['indicator', 'value'], preComment: true },
    { id: 'XII',  roman: 'XII',  name: 'Закупівлі',                   sections: ['procurement'],
      columns: ['indicator', 'value'] },
    { id: 'XIII', roman: 'XIII', name: 'Допомога ЗСУ',                sections: ['zsu'],
      columns: ['indicator', 'value'] },
    {
        id: 'XIV', roman: 'XIV', name: 'Інша інформація',
        sections: [], isText: true,
        noteTypes: ['other']
    }
];

export const MONTHLY_BLOCKS = [
    { id: 'M1', name: 'Фінансові показники',       groups: ['finance'] },
    { id: 'M2', name: 'Доходи та реалізація',      groups: ['revenue'] },
    { id: 'M3', name: 'Виробництво та лісове господарство', groups: ['production', 'forestry'] },
    { id: 'M_TEXT', name: 'Текстовий коментар',     isText: true }
];

// --- Helper: section key → block ---
const _sectionToBlock = new Map();
for (const block of WEEKLY_BLOCKS) {
    for (const sec of block.sections) {
        _sectionToBlock.set(sec, block);
    }
}

export function getBlockForSection(sectionKey) {
    return _sectionToBlock.get(sectionKey) || null;
}

// --- Helper: get weekly data rows for a block ---
export function getBlockData(blockId, weeklyData) {
    const block = WEEKLY_BLOCKS.find(b => b.id === blockId);
    if (!block || block.isText) return [];
    return weeklyData.filter(r => block.sections.includes(r.section));
}

// --- Helper: get section keys for a block ---
export function getSectionsForBlock(blockId) {
    const block = WEEKLY_BLOCKS.find(b => b.id === blockId);
    return block ? block.sections : [];
}

// --- Helper: get monthly indicators for a block ---
export function getMonthlyBlockData(blockId, monthlyData) {
    const block = MONTHLY_BLOCKS.find(b => b.id === blockId);
    if (!block || block.isText) return [];
    return monthlyData.filter(r => block.groups.includes(r.indicator_group));
}
