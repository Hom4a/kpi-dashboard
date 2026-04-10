# KPI Dashboard — ДП «Ліси України»

## Що це за проект

Корпоративний аналітичний дашборд для моніторингу KPI державного підприємства «Ліси України». Користувачі завантажують Excel/Word звіти, система парсить дані і візуалізує їх у вигляді таблиць, графіків, інфографіки.

**Мова інтерфейсу**: українська (UK). Всі тексти, назви показників, місяці — українською.

## Архітектура

- **Frontend**: Static SPA (Vite build) → GitHub Pages (`/kpi-dashboard/`)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **PWA**: Service Worker v8 (Network-First для app, Cache-First для CDN)
- **Деплой**: Push to `master` → GitHub Actions → `npm run build` → deploy `dist/`

## Як запустити

```bash
npm run dev       # Vite dev server (localhost:3000)
npm run build     # Production build → dist/
npm run preview   # Preview built dist/
```

## Структура проекту

```
js/
├── app.js                 # Головний entry point, wires все разом
├── state.js               # Глобальний стейт (allData, filtered, charts)
├── config.js              # Supabase URL + anon key
├── auth.js                # Авторизація, ролі, PAGE_ACCESS матриця
├── file-handler.js        # Автодетект типу файлу, диспатч на парсер
├── navigation.js          # Переключення сторінок
├── lazy-libs.js           # Динамічний імпорт великих бібліотек
│
├── summary/               # ★ ГОЛОВНИЙ модуль — щомісячна + щотижнева довідки
│   ├── parse-summary-xlsx.js   # Парсер Excel "Основні показники"
│   ├── parse-summary-docx.js   # Парсер Word щотижневої довідки
│   ├── render-summary.js       # Рендер weekly tab (блоки I-XV)
│   ├── render-monthly.js       # Рендер monthly tab (таблиці + з/п)
│   ├── infographic-modal.js    # Графіки при кліку на показник
│   ├── block-map.js            # Конфігурація блоків (секції, стовпчики)
│   ├── cell-annotations.js     # Анотації на рядках (правий клік)
│   ├── db-summary.js           # CRUD для summary_indicators + summary_weekly
│   └── state-summary.js        # Стейт модуля
│
├── forest/                # Ліс: ціни, залишки
├── harvesting/            # Заготівля: план-факт, ЗСУ
├── market/                # Ринок: міжнародні ціни, НБУ курс
├── builder/               # Конструктор дашбордів (GridStack)
├── data-entry/            # Форми введення даних
├── gis/                   # Карта (Leaflet, lazy)
├── procurement/           # ProZorro інтеграція
└── wood-accounting/       # ЕОД (1С бухгалтерія)

css/
├── variables.css          # CSS змінні (--primary, --bg, --text)
├── base.css, layout.css   # Базові стилі
├── components.css         # Кнопки, таблиці, картки
├── summary.css            # Стилі для довідок
├── mobile.css             # Мобільні breakpoints
└── print-summary.css      # Стилі для друку
```

## Ключові патерни

### State модулі
```javascript
// js/summary/state-summary.js
export let summaryIndicators = [];
export function setSummaryIndicators(v) { summaryIndicators = v; }
```

### DB модулі
```javascript
// js/summary/db-summary.js
import { sb } from '../config.js';
await sb.from('summary_weekly').select('*').eq('report_date', date);
```

### Парсинг файлів
```
Користувач обирає файл → file-handler.js::handleFile()
  → .docx → parse-summary-docx.js (щотижнева)
  → .xlsx → detectFileType() → parse-summary-xlsx.js / parse-kpi.js / ...
  → saveSummaryWeekly() / saveSummaryIndicators()
  → loadSummaryDataAndRender()
```

### Рендеринг
```javascript
// Табличний рендер з block-map конфігурацією
renderSectionTable(sData, blockColumns)  // weekly
renderTable(title, rowNames, subSet, showYears, year, month, allData, commentId)  // monthly
```

## Важливі особливості парсера

### Щотижневий .docx парсер (`parse-summary-docx.js`)

**Universal Column Detection**: Стовпчики визначаються ДИНАМІЧНО з заголовків кожної таблиці. Підтримує 3 версії шаблонів:
- v1 (17 таблиць): `indicator | ytd | current`
- v2 (19 таблиць): + fires, forestry_campaign
- v3 (20 таблиць): `indicator | current | %Δ | previous | ytd`

**%Δ з Word ІГНОРУЄТЬСЯ** — дельту рахуємо в дашборді через cross-week enrichment.

**Секції ідентифікуються по keywords** (не по індексу таблиці):
```javascript
{ section: 'kpi', header: /попередній тиждень/i }
{ section: 'forest_protection', data: /кількість випадків/i }
```

**Дата з "станом на DD.MM.YY"** — віднімаємо 1 день (дані за ПОПЕРЕДНІЙ тиждень).

**Підтримка 2-digit року**: `26` → `2026`.

### Місячний Excel парсер (`parse-summary-xlsx.js`)

**Два типи показників**:
- Звичайні (числові): `sub_type = 'value'`
- Об'єм/ціна: `"360,6(2318,7)"` → `sub_type = 'value', value_text = "360,6(2318,7)"`, volume в `value_numeric`

**Підтримка обох форматів**: slash `360,6/2318,7` і bracket `360,6(2318,7)`.

**Snapshot vs Cumulative індикатори** (`render-monthly.js`):
- Cumulative (ФОП, реалізація): YTD = сума місяців
- Snapshot (чисельність, з/п, залишки): YTD = останнє значення

**matchIndicator()** — fuzzy matching з розділенням vol/price від звичайних.

## База даних (Supabase)

### Основні таблиці
| Таблиця | Призначення |
|---|---|
| `summary_indicators` | Місячні показники (xlsx). Ключ: `(year, month, indicator_name, sub_type)` |
| `summary_weekly` | Щотижневі показники (docx). Ключ: `(report_date, section, indicator_name)` |
| `summary_weekly_notes` | Текстові блоки довідки. Ключ: `(report_date, note_type)` |
| `summary_block_comments` | Коментарі + анотації. Partial unique index! |
| `kpi_records` | KPI обсягів |
| `forest_prices` / `forest_inventory` | Ліс: ціни та залишки |
| `market_prices` / `market_prices_ua` | Ринок: міжнародні + українські |
| `profiles` | Користувачі (розширення Supabase Auth) |

### Відомі проблеми з БД
- `summary_block_comments` має **partial unique index** — `.upsert()` НЕ працює! Використовуємо `select + insert/update`.
- RLS policy іноді блокує збереження NBU курсу (403).
- `created_at` використовується для збереження порядку рядків (`.order('created_at')`).

## Формули розрахунків

### Місячна довідка — Темп росту
```javascript
// render-monthly.js
pct = cur / prev * 100    // 52% означає "поточне = 52% від попереднього"
// > 100% = зелений (зростання), < 100% = червоний (спад)
```

### Тижнева довідка — Cross-week enrichment
```javascript
// render-summary.js: renderWeeklyBriefing()
// Для кожного показника поточного тижня:
// 1. Якщо value_previous є (з парсера) → використовується
// 2. Якщо null → шукаємо той самий показник в попередньому тижні → _prev_from_history
// 3. calcDeltaPct(current, previous)
```

### Інфографіка — Delta labels
```javascript
// infographic-modal.js: deltaLabels plugin
pct = cur / prev * 100   // Темп росту (як в таблиці)
// > 100% = зелений, < 100% = рожевий
```

## Правила при роботі з кодом

### НЕ робити
- Не використовувати `.upsert()` для таблиць з partial unique indexes
- Не фільтрувати по `sub_type = 'value'` — включати всі sub_types
- Не сумувати snapshot-індикатори (чисельність, з/п) — брати останнє значення
- Не змішувати vol/price показники зі звичайними (різні `indicator_name`)
- Не хардкодити порядок стовпчиків для .docx таблиць — використовувати `detectCols()`

### Обов'язково
- Після зміни парсера — перезавантажити файли в систему
- `FileList` → `Array.from()` перед async обробкою (DOM invalidation)
- При порівнянні indicator_name — нормалізувати пробіли `.replace(/\s+/g, ' ').trim()`
- Апострофи в ilike pattern → замінювати на `%` wildcard
- Для січня: delta порівнює з груднем ПОПЕРЕДНЬОГО року
- `getLatestMonth()` — фільтрувати по `sub_type='value'` і `value_numeric != null`

## Git & Deploy

- **Branch**: `master`
- **User**: `Hom4a`
- **Auto-deploy**: `.github/workflows/deploy.yml` → GitHub Pages
- **Base path**: `/kpi-dashboard/`
- **Після push**: GitHub Actions будує і деплоїть автоматично (~2 хв)
- **Кеш браузера**: Ctrl+Shift+R після деплою (Service Worker може кешувати старе)

## Ролі користувачів

| Роль | Можливості |
|---|---|
| `admin` | Повний доступ, керування користувачами |
| `director` | Перегляд всіх сторінок |
| `analyst` | Перегляд + завантаження |
| `editor` | Введення даних, завантаження |
| `viewer` | Тільки перегляд |

## Зовнішні API

- **Supabase**: `qfggalnkosrpfaosrqhj.supabase.co`
- **ProZorro**: Public API через `corsproxy.io` (CORS proxy)
- **НБУ**: `bank.gov.ua/NBU_Exchange` (курс EUR/UAH)
- **CDN**: Chart.js, Leaflet, GridStack — lazy-loaded через `js/lazy-libs.js`
