// ===== Widget Catalog — definitions for all widget types =====

export const WIDGET_TYPES = {
    kpi_card: {
        type: 'kpi_card',
        label: 'KPI картка',
        icon: '📊',
        category: 'data',
        defaultSize: { w: 3, h: 2 },
        minSize: { w: 2, h: 2 },
        defaultConfig: {
            title: 'KPI',
            data_source: 'kpi_records',
            metric_field: 'value',
            aggregation: 'sum',
            filters: {},
            format: 'number',
            color: 'green',
            show_sparkline: false
        }
    },
    line_chart: {
        type: 'line_chart',
        label: 'Лінійний графік',
        icon: '📈',
        category: 'data',
        defaultSize: { w: 6, h: 4 },
        minSize: { w: 3, h: 3 },
        defaultConfig: {
            title: 'Графік',
            data_source: 'kpi_records',
            x_field: 'date',
            y_field: 'value',
            aggregation: 'sum',
            group_by: '',
            filters: {},
            fill: true
        }
    },
    bar_chart: {
        type: 'bar_chart',
        label: 'Стовпчиковий',
        icon: '📊',
        category: 'data',
        defaultSize: { w: 6, h: 4 },
        minSize: { w: 3, h: 3 },
        defaultConfig: {
            title: 'Стовпчики',
            data_source: 'kpi_records',
            x_field: 'type',
            y_field: 'value',
            aggregation: 'sum',
            filters: {},
            horizontal: false,
            stacked: false
        }
    },
    pie_chart: {
        type: 'pie_chart',
        label: 'Кругова',
        icon: '🍩',
        category: 'data',
        defaultSize: { w: 4, h: 4 },
        minSize: { w: 3, h: 3 },
        defaultConfig: {
            title: 'Розподіл',
            data_source: 'forest_prices',
            group_by: 'product',
            metric_field: 'volume_m3',
            aggregation: 'sum',
            filters: {},
            doughnut: true
        }
    },
    table_widget: {
        type: 'table_widget',
        label: 'Таблиця',
        icon: '📋',
        category: 'data',
        defaultSize: { w: 6, h: 4 },
        minSize: { w: 3, h: 3 },
        defaultConfig: {
            title: 'Таблиця',
            data_source: 'kpi_records',
            columns: [],
            filters: {},
            limit: 50,
            group_by: '',
            aggregation: ''
        }
    },
    text_widget: {
        type: 'text_widget',
        label: 'Текст',
        icon: '📝',
        category: 'other',
        defaultSize: { w: 4, h: 2 },
        minSize: { w: 2, h: 1 },
        defaultConfig: {
            title: '',
            content: 'Текстовий блок',
            align: 'left'
        }
    },
    gauge: {
        type: 'gauge',
        label: 'Gauge',
        icon: '🎯',
        category: 'data',
        defaultSize: { w: 3, h: 3 },
        minSize: { w: 2, h: 2 },
        defaultConfig: {
            title: 'Виконання',
            data_source: 'harvesting_plan_fact',
            value_field: 'harvested_total',
            target_field: 'annual_plan_total',
            aggregation: 'sum',
            filters: {}
        }
    },
    alert_list: {
        type: 'alert_list',
        label: 'Алерти',
        icon: '⚠️',
        category: 'other',
        defaultSize: { w: 4, h: 3 },
        minSize: { w: 3, h: 2 },
        defaultConfig: {
            title: 'Попередження',
            data_source: 'harvesting_plan_fact',
            condition_field: 'pct_annual_total',
            threshold: 80,
            label_field: 'regional_office',
            filters: {}
        }
    }
};

export const WIDGET_CATEGORIES = [
    { id: 'data', label: 'Дані' },
    { id: 'other', label: 'Інше' }
];

export const AGGREGATIONS = [
    { value: 'sum', label: 'Сума' },
    { value: 'avg', label: 'Середнє' },
    { value: 'count', label: 'Кількість' },
    { value: 'max', label: 'Максимум' },
    { value: 'min', label: 'Мінімум' }
];

export const FORMAT_OPTIONS = [
    { value: 'number', label: 'Число' },
    { value: 'volume_k', label: 'тис.м³' },
    { value: 'money_m', label: 'млн грн' },
    { value: 'percent', label: '%' },
    { value: 'price', label: 'грн/м³' }
];

export const COLOR_OPTIONS = [
    { value: 'green', label: 'Зелений', css: 'var(--primary)' },
    { value: 'blue', label: 'Синій', css: '#3498DB' },
    { value: 'amber', label: 'Жовтий', css: '#F5A623' },
    { value: 'red', label: 'Червоний', css: '#E74C3C' },
    { value: 'purple', label: 'Фіолетовий', css: '#9B59B6' },
    { value: 'teal', label: 'Бірюзовий', css: '#1ABC9C' }
];
