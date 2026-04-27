"""Metric and species alias dictionaries.

Every Excel variant of a metric name maps to a stable ``metric_code``. Aliases
are stored as-is (with original whitespace/punctuation) and normalized at
lookup time via ``_norm()``.

Normalization rule (symmetric on alias side and on row-name side):
    strip + collapse whitespace + casefold
"""
from __future__ import annotations


def _norm(s: str) -> str:
    """Normalize a string for alias matching: strip, collapse whitespace, casefold."""
    return " ".join(s.split()).casefold()


# ---------------------------------------------------------------------------
# Scalar metrics (single numeric value per year/month)
# ---------------------------------------------------------------------------

METRIC_ALIASES: dict[str, list[str]] = {
    # --- Financial ---
    "fin_stability_coef": [
        "Коефіцієнт фінансової стійкості (станом на кінець кварталу)",
        "Коефіцієнт фінансової стійкості",
    ],
    "payroll_fund_mln": [
        "Фонд оплати праці, млн. грн",
        "Фонд оплати праці, млн грн",
        "ФОП, млн. грн",
    ],
    "headcount": [
        "Середньооблікова чисельність штатних працівників",
        "Середньооблікова чисельність штатних",
    ],
    "avg_salary_grn": [
        "Середня заробітна плата штатного працівника, грн",
        "Середня заробітна плата штатного працівника,  грн",
    ],
    "receivables_mln": [
        "Дебіторська заборгованість, млн. грн",
        "Дебіторська заборгованість,  млн. грн",
        "Дебіторська заборгованість млн. грн",
    ],
    "payables_mln": [
        "Кредиторська заборгованість, млн. грн",
        "Кредиторська заборгованість,  млн. грн",
        "Кредиторська заборгованість млн. грн",
    ],
    "cash_balance_mln": [
        "Залишок коштів на рахунках, млн. грн",
        "Залишок коштів на рахунках,  млн. грн",
        "Залишок коштів на рахунках млн. грн",
    ],
    "arrears_budget_mln": [
        "Недоїмка перед бюджетом, млн. грн",
        "Недоїмка перед бюджетом  млн. грн",
        "Недоїмка перед бюджетом млн. грн",
    ],
    "arrears_pf_mln": [
        "Недоїмка перед ПФ, млн. грн",
        "Недоїмка перед ПФ  млн. грн",
        "Недоїмка перед ПФ млн. грн",
    ],

    # --- Revenue ---
    "revenue_total_mln": [
        "Загальна реалізація, млн. грн",
        "Загальна реалізація, млн. грн (без ПДВ)",
        "Загальна реалізація, млн грн",
    ],
    "revenue_roundwood_mln": [
        "в т.ч: лісоматеріали в круглому вигляді, млн. грн",
        "в т.ч: лісоматеріали в круглому вигляді,  млн. грн",
    ],
    "revenue_processing_mln": [
        "продукція переробки, млн. грн",
        "продукція переробки,  млн. грн",
    ],
    "revenue_other_mln": [
        "інша реалізація (послуги, побічне користування тощо), млн грн",
        "інша реалізація (послуги, побічне користування тощо), млн. грн",
    ],
    "revenue_export_mln": [
        "Реалізовано на експорт, млн. грн",
    ],
    # NOTE: revenue_per_employee_grn is DERIVED (see etl/derived.py) —
    # NOT parsed from Excel. The Excel cell is just a human-readable copy
    # that may drift from the canonical formula (hc avg × revenue).

    # --- Production / timber ---
    "processing_volume_km3": [
        "Обсяг переробки, всього, тис. м3",
    ],
    "sale_roundwood_km3": [
        "Реалізація лісоматеріалів круглих, тис. м3",
    ],
    "sale_roundwood_price_grn": [
        "Середня ціна реалізації 1 м3 лісоматеріалів круглих, грн/м3",
        "Середня цін реалізації 1 м3 лісоматеріалів круглих, грн/м3",
    ],
    "sale_pv_firewood_km3": [
        "Реалізація деревини дров'яної ПВ тис. м3",
        "Реалізація деревини дров'яної ПВ  тис. м3",
        "Реалізація деревинт дров'яної ПВ тис. м3",
    ],
    "sale_pv_firewood_price_grn": [
        "Середня ціна реалізації 1 м3 деревини дровяної ПВ, грн/м3",
    ],
    "sale_np_firewood_km3": [
        "Реалізація деревини дров'яної НП тис. м3",
        "Реалізація деревини дров'яної НП  тис. м3",
        "Реалізація деревинт дров'яної НП тис. м3",
    ],
    "sale_np_firewood_price_grn": [
        "Середня ціна реалізації 1 м3 деревини дровяної НП, грн/м3",
    ],
    "avg_wood_price_grn": [
        "Ціна знеособленого 1 м3 реалізованої деревини, грн.",
        "Ціна знеособленого 1 м3 реалізованої деревини, грн",
    ],

    # --- Forestry / harvest ---
    "harvest_total_km3": [
        "Заготівля деревини, всього тис. м3",
        "Заготівля деревини, всього  тис. м3",
    ],
    "harvest_main_km3": [
        "Рубки головного користування",
    ],
    "harvest_care_km3": [
        "Рубки формування і оздоровлення лісів",
    ],
    "reforestation_ha": [
        "Лісовідновлення (га)",
        "Лісовідновлення(га)",
    ],
    "afforestation_ha": [
        "Лісорозведення (га)",
        "Лісорозведення(га)",
    ],
    "natural_regen_ha": [
        "Сприяння природному поновленню (га)",
        "Сприяння природному поновленню(га)",
    ],
    "seedlings_mln_pcs": [
        "Вирощування садивного матеріалу із закритою кореневою системою, млн шт.",
    ],

    # --- Taxes ---
    "tax_total_mln": [
        "Сплачено податків та зборів всього, млн. грн.",
        "Сплачено податків та зборів всього млн. грн.",
        "Сплачено податків та зборів всього, млн. грн",
    ],
    "tax_esv_mln": [
        "єдиний соціальний внесок, млн. грн",
        "єдиний соціальний внесок  млн. грн",
    ],
    "tax_rent_mln": [
        "рентна плата за спеціальне використання лісових ресурсів, млн. грн",
        "рентна плата за спеціальне використання лісових ресурсів млн. грн",
    ],
    "tax_vat_mln": [
        "податок на додану вартість, млн. грн",
        "податок на додану вартість  млн. грн",
    ],
    "tax_profit_mln": [
        "податок на прибуток, млн. грн",
        "податок на прибуток  млн. грн",
    ],
    "tax_pdfo_mln": [
        "ПДФО, млн. грн",
        "ПДФО",
        "ПДФО  млн. грн",
    ],
    "tax_vz_mln": [
        "ВЗ, млн. грн",
        "ВЗ",
        "ВЗ  млн. грн",
    ],
    "tax_land_mln": [
        "податок на лісові землі, млн. грн",
        "податок на лісові землі   млн. грн",
    ],
    "tax_dividends_mln": [
        "дивіденди, млн. грн",
        "дивіденди  млн. грн",
    ],
    "tax_other_mln": [
        "інші, млн. грн",
        "інші   млн. грн",
    ],
}


# ---------------------------------------------------------------------------
# Composite cells: timber species with "volume/avg_price" packed value
# ---------------------------------------------------------------------------

SPECIES_ALIASES: dict[str, list[str]] = {
    "alder_birch": [
        "В.т.ч: вільха, береза тис. м3/сер. ціна грн",
        "вільха, береза тис. м3/сер. ціна грн",
    ],
    "pine": [
        "сосна тис. м3/сер. ціна грн",
    ],
    "oak": [
        "дуб тис. м3/сер. ціна грн",
    ],
    "other": [
        "інші тис. м3/сер. ціна грн",
    ],
}


# ---------------------------------------------------------------------------
# IGNORE list: Excel rows that look like metrics but are derived / informational.
# Parsers recognize these names and SILENTLY skip them (no unknown_metric
# warning, no fact row). The canonical value for these codes is produced by
# ``etl/derived.py`` from other canonical facts.
# ---------------------------------------------------------------------------

METRIC_ALIASES_IGNORE: dict[str, list[str]] = {
    "revenue_per_employee_grn": [
        "Реалізовано на 1 штатного, грн",
    ],
}

_IGNORE_INDEX: set[str] = {
    _norm(alias)
    for aliases in METRIC_ALIASES_IGNORE.values()
    for alias in aliases
}


def is_ignored(raw_name: str) -> bool:
    """Return True if ``raw_name`` matches a derived/informational row.

    Parsers should treat these as silently skipped (neither emit a fact nor
    warn ``unknown_metric``).
    """
    return _norm(raw_name) in _IGNORE_INDEX


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

# Pre-normalized alias → metric_code index (built once at import time)
_METRIC_INDEX: dict[str, str] = {
    _norm(alias): code
    for code, aliases in METRIC_ALIASES.items()
    for alias in aliases
}

_SPECIES_INDEX: dict[str, str] = {
    _norm(alias): code
    for code, aliases in SPECIES_ALIASES.items()
    for alias in aliases
}


def resolve_metric(raw_name: str) -> str | None:
    """Return ``metric_code`` for an Excel row name, or None if unknown."""
    return _METRIC_INDEX.get(_norm(raw_name))


def resolve_species(raw_name: str) -> str | None:
    """Return ``species`` code for an Excel row name, or None if unknown."""
    return _SPECIES_INDEX.get(_norm(raw_name))
