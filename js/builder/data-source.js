// ===== Unified Data Source for Dashboard Builder =====
import { sb } from '../config.js';

// System tables — direct Supabase queries
const SYSTEM_SOURCES = {
    kpi_records: {
        table: 'kpi_records',
        label: 'KPI (обсяги та фінанси)',
        fields: [
            { name: 'date', label: 'Дата', type: 'date' },
            { name: 'indicator', label: 'Показник', type: 'text' },
            { name: 'type', label: 'Тип', type: 'text' },
            { name: 'value', label: 'Значення', type: 'number' },
            { name: 'unit', label: 'Одиниця', type: 'text' }
        ]
    },
    forest_prices: {
        table: 'forest_prices',
        label: 'Середньозважені ціни',
        fields: [
            { name: 'branch', label: 'Філія', type: 'text' },
            { name: 'region', label: 'Область', type: 'text' },
            { name: 'warehouse', label: 'Склад', type: 'text' },
            { name: 'product', label: 'Продукція', type: 'text' },
            { name: 'species', label: 'Порода', type: 'text' },
            { name: 'quality_class', label: 'Клас якості', type: 'text' },
            { name: 'volume_m3', label: 'Обсяг м³', type: 'number' },
            { name: 'weighted_price_uah', label: 'Ціна грн/м³', type: 'number' },
            { name: 'total_value_uah', label: 'Вартість грн', type: 'number' }
        ]
    },
    forest_inventory: {
        table: 'forest_inventory',
        label: 'Залишки лісопродукції',
        fields: [
            { name: 'branch', label: 'Філія', type: 'text' },
            { name: 'region', label: 'Область', type: 'text' },
            { name: 'forest_unit', label: 'Надлісництво', type: 'text' },
            { name: 'product', label: 'Продукція', type: 'text' },
            { name: 'species', label: 'Порода', type: 'text' },
            { name: 'remaining_volume_m3', label: 'Залишок м³', type: 'number' }
        ]
    },
    harvesting_plan_fact: {
        table: 'harvesting_plan_fact',
        label: 'План-факт заготівлі',
        fields: [
            { name: 'regional_office', label: 'Обл. управління', type: 'text' },
            { name: 'annual_plan_total', label: 'Річний план', type: 'number' },
            { name: 'harvested_total', label: 'Заготовлено', type: 'number' },
            { name: 'pct_annual_total', label: '% від плану', type: 'number' }
        ]
    },
    harvesting_zsu: {
        table: 'harvesting_zsu',
        label: 'Поставки ЗСУ',
        fields: [
            { name: 'regional_office', label: 'Обл. управління', type: 'text' },
            { name: 'forest_products_declared_m3', label: 'Лісопр. заявл.', type: 'number' },
            { name: 'forest_products_shipped_m3', label: 'Лісопр. відвант.', type: 'number' },
            { name: 'forest_products_value_uah', label: 'Лісопр. вартість', type: 'number' },
            { name: 'lumber_declared_m3', label: 'Пилом. заявл.', type: 'number' },
            { name: 'lumber_shipped_m3', label: 'Пилом. відвант.', type: 'number' }
        ]
    },
    market_prices: {
        table: 'market_prices',
        label: 'Ринкові ціни (міжнародні)',
        fields: [
            { name: 'period', label: 'Період', type: 'text' },
            { name: 'country', label: 'Країна', type: 'text' },
            { name: 'row_type', label: 'Тип', type: 'text' },
            { name: 'pine_business', label: 'Сосна', type: 'number' },
            { name: 'spruce_business', label: 'Ялина', type: 'number' },
            { name: 'alder_business', label: 'Вільха', type: 'number' },
            { name: 'birch_business', label: 'Береза', type: 'number' },
            { name: 'oak_business', label: 'Дуб', type: 'number' },
            { name: 'pine_firewood', label: 'Сосна (др.)', type: 'number' },
            { name: 'spruce_firewood', label: 'Ялина (др.)', type: 'number' },
            { name: 'birch_firewood', label: 'Береза (др.)', type: 'number' },
            { name: 'avg_price', label: 'Середня ціна', type: 'number' },
            { name: 'eur_rate', label: 'Курс EUR', type: 'number' }
        ]
    },
    market_prices_ua: {
        table: 'market_prices_ua',
        label: 'Ринкові ціни (Україна, біржі)',
        fields: [
            { name: 'period', label: 'Період', type: 'text' },
            { name: 'exchange', label: 'Біржа', type: 'text' },
            { name: 'species', label: 'Порода', type: 'text' },
            { name: 'volume_m3', label: 'Обсяг м³', type: 'number' },
            { name: 'total_uah', label: 'Сума грн', type: 'number' },
            { name: 'avg_price_uah', label: 'Ціна грн/м³', type: 'number' },
            { name: 'avg_price_eur', label: 'Ціна EUR', type: 'number' }
        ]
    },
    market_price_history: {
        table: 'market_price_history',
        label: 'Динаміка ринкових цін',
        fields: [
            { name: 'data_type', label: 'Тип', type: 'text' },
            { name: 'entity_name', label: 'Назва', type: 'text' },
            { name: 'month_date', label: 'Місяць', type: 'date' },
            { name: 'price_eur', label: 'Ціна EUR', type: 'number' }
        ]
    }
};

// Cache for custom sources loaded from dataset_types
let _customSourcesCache = null;

export function getSystemSources() { return SYSTEM_SOURCES; }

export async function getAllSources() {
    const sources = { ...SYSTEM_SOURCES };
    // Load custom dataset_types
    if (!_customSourcesCache) {
        try {
            const { data } = await sb.from('dataset_types')
                .select('*')
                .eq('is_system', false);
            _customSourcesCache = (data || []).map(dt => ({
                table: 'custom_datasets',
                datasetTypeId: dt.id,
                label: dt.display_name,
                fields: (dt.schema || []).map(f => ({
                    name: f.name, label: f.label, type: f.type === 'number' ? 'number' : 'text'
                }))
            }));
        } catch (e) {
            _customSourcesCache = [];
        }
    }
    for (const cs of _customSourcesCache) {
        sources['custom_' + cs.datasetTypeId] = cs;
    }
    return sources;
}

export function invalidateSourceCache() { _customSourcesCache = null; }

// Query data from any source
export async function queryData({ source, filters, groupBy, aggregation, metricField, orderBy, limit }) {
    const sources = await getAllSources();
    const src = sources[source];
    if (!src) return [];

    let rows;
    if (src.table === 'custom_datasets') {
        rows = await loadCustomRows(src.datasetTypeId);
    } else {
        rows = await loadSystemRows(src.table, filters);
    }

    // Apply client-side filters
    if (filters) {
        rows = applyFilters(rows, filters);
    }

    // Group + aggregate
    if (groupBy && aggregation && metricField) {
        rows = aggregate(rows, groupBy, metricField, aggregation);
    }

    // Sort
    if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        rows.sort((a, b) => {
            const va = a[field], vb = b[field];
            if (va == null) return 1; if (vb == null) return -1;
            return desc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
        });
    }

    if (limit) rows = rows.slice(0, limit);
    return rows;
}

async function loadSystemRows(table, filters) {
    const all = []; let from = 0;
    while (true) {
        let q = sb.from(table).select('*');
        // Apply server-side equality filters where possible
        if (filters) {
            for (const [k, v] of Object.entries(filters)) {
                if (typeof v === 'string') q = q.eq(k, v);
                else if (Array.isArray(v)) q = q.in(k, v);
            }
        }
        const { data, error } = await q.range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

async function loadCustomRows(datasetTypeId) {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('custom_datasets')
            .select('*')
            .eq('dataset_type_id', datasetTypeId)
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data.map(r => ({ _id: r.id, ...r.data })));
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

function applyFilters(rows, filters) {
    return rows.filter(r => {
        for (const [k, v] of Object.entries(filters)) {
            if (v === '' || v === null || v === undefined) continue;
            if (Array.isArray(v)) {
                if (!v.includes(r[k])) return false;
            } else if (typeof v === 'object' && v.min !== undefined) {
                if (r[k] < v.min || r[k] > v.max) return false;
            } else {
                if (String(r[k]) !== String(v)) return false;
            }
        }
        return true;
    });
}

function aggregate(rows, groupBy, metricField, agg) {
    const groups = {};
    for (const r of rows) {
        const key = String(r[groupBy] || 'Інше');
        if (!groups[key]) groups[key] = { _label: key, _values: [], _count: 0 };
        const val = Number(r[metricField]);
        if (!isNaN(val)) groups[key]._values.push(val);
        groups[key]._count++;
    }

    return Object.values(groups).map(g => {
        const vals = g._values;
        let result;
        switch (agg) {
            case 'sum': result = vals.reduce((a, b) => a + b, 0); break;
            case 'avg': result = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
            case 'count': result = g._count; break;
            case 'max': result = vals.length ? Math.max(...vals) : 0; break;
            case 'min': result = vals.length ? Math.min(...vals) : 0; break;
            default: result = vals.reduce((a, b) => a + b, 0);
        }
        return { [groupBy]: g._label, [metricField]: result, _count: g._count };
    });
}

// Get unique values for a field (for filter dropdowns in config panel)
export async function getFieldValues(source, fieldName, limit = 50) {
    const rows = await queryData({ source, limit: 2000 });
    const unique = [...new Set(rows.map(r => r[fieldName]).filter(Boolean))];
    return unique.sort().slice(0, limit);
}
