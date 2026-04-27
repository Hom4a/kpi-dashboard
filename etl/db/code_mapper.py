"""Translate Python-side metric/species codes to DB-side codes (and back).

After migration 15 the maps are identity for all 39 known codes — the move
to Python-style suffixes was applied DB-side. This module exists as
insurance: if the DB schema later diverges (e.g. a sister project with
different conventions), only this file changes — the rest of the ETL is
oblivious to the rename.

Unknown code → ``UnknownMetricError`` (subclass of ``KeyError``) with a
clear message. We deliberately avoid silent fallback: a typo in metric_code
is a bug that should fail loudly. Callers that need to react specifically
to unknown-metric failures (e.g. CLI exit codes) can ``except`` the
narrower class without resorting to message-substring matching.
"""
from __future__ import annotations


class UnknownMetricError(KeyError):
    """Raised when a metric_code / species_code has no DB-side mapping.

    Inherits from ``KeyError`` so that legacy ``except KeyError`` handlers
    keep working; new code can ``except UnknownMetricError`` for precise
    behaviour.
    """

# Mapping of all 39 Python-side metric codes to their DB-side
# ``indicator.code`` equivalents. Most entries are identity — migration 15
# applied the rename DB-side first, so Python and DB agreed on those.
#
# Three rows are NOT identity — Python's ``etl/metrics.py`` predates the
# rename and still emits the historical names. ``code_mapper`` is the
# one place that bridges the gap. If we ever rename ``etl/metrics.py``
# keys to match the DB, these three lines become identity again.
CODE_MAP_PYTHON_TO_DB: dict[str, str] = {
    # M_FIN
    "fin_stability_coef":      "fin_stability_coef",
    "payroll_fund_mln":        "payroll_fund_mln",
    "headcount":               "headcount",
    "avg_salary_grn":          "avg_salary_grn",
    "receivables_mln":         "receivables_mln",
    "payables_mln":            "payables_mln",
    "cash_balance_mln":        "cash_balance_mln",
    "arrears_budget_mln":      "budget_overdue_mln",   # rename: pre-mig15 → mig15
    "arrears_pf_mln":          "pf_overdue_mln",
    # M_REV
    "revenue_total_mln":       "revenue_total_mln",
    "revenue_roundwood_mln":   "revenue_roundwood_mln",
    "revenue_processing_mln":  "revenue_processing_mln",
    "revenue_other_mln":       "revenue_other_mln",
    "revenue_export_mln":      "revenue_export_mln",
    "revenue_per_employee_grn": "revenue_per_employee_grn",
    # M_PROD
    "processing_volume_km3":   "processing_volume_km3",
    "sale_roundwood_km3":      "sale_roundwood_km3",
    "sale_roundwood_price_grn": "sale_roundwood_price_grn",
    "sale_pv_firewood_km3":    "sale_pv_firewood_km3",
    "sale_pv_firewood_price_grn": "sale_pv_firewood_price_grn",
    "sale_np_firewood_km3":    "sale_np_firewood_km3",
    "sale_np_firewood_price_grn": "sale_np_firewood_price_grn",
    "avg_wood_price_grn":      "avg_unit_price_grn",   # rename: pre-mig15 → mig15
    # M_FOR
    "harvest_total_km3":       "harvest_total_km3",
    "harvest_main_km3":        "harvest_main_km3",
    "harvest_care_km3":        "harvest_care_km3",
    "reforestation_ha":        "reforestation_ha",
    "afforestation_ha":        "afforestation_ha",
    "natural_regen_ha":        "natural_regen_ha",
    "seedlings_mln_pcs":       "seedlings_mln_pcs",
    # M_TAX
    "tax_total_mln":           "tax_total_mln",
    "tax_esv_mln":             "tax_esv_mln",
    "tax_rent_mln":            "tax_rent_mln",
    "tax_vat_mln":             "tax_vat_mln",
    "tax_profit_mln":          "tax_profit_mln",
    "tax_pdfo_mln":            "tax_pdfo_mln",
    "tax_vz_mln":              "tax_vz_mln",
    "tax_land_mln":            "tax_land_mln",
    "tax_dividends_mln":       "tax_dividends_mln",
    "tax_other_mln":           "tax_other_mln",
}

CODE_MAP_DB_TO_PYTHON: dict[str, str] = {
    db: py for py, db in CODE_MAP_PYTHON_TO_DB.items()
}

# Species composites live in `indicators` table under `vp_*` codes.
# Python side uses semantic names (alder_birch, pine, oak, other).
SPECIES_CODE_MAP_PYTHON_TO_DB: dict[str, str] = {
    "alder_birch": "vp_birch",
    "pine":        "vp_pine",
    "oak":         "vp_oak",
    "other":       "vp_other",
}

SPECIES_CODE_MAP_DB_TO_PYTHON: dict[str, str] = {
    db: py for py, db in SPECIES_CODE_MAP_PYTHON_TO_DB.items()
}


def python_to_db(metric_code: str) -> str:
    """Translate a Python metric_code to the DB-side ``indicator.code``."""
    try:
        return CODE_MAP_PYTHON_TO_DB[metric_code]
    except KeyError as exc:
        raise UnknownMetricError(
            f"Unknown Python metric_code: {metric_code!r}. "
            f"Add it to CODE_MAP_PYTHON_TO_DB in etl/db/code_mapper.py."
        ) from exc


def db_to_python(db_code: str) -> str:
    """Reverse: DB ``indicator.code`` → Python metric_code."""
    try:
        return CODE_MAP_DB_TO_PYTHON[db_code]
    except KeyError as exc:
        raise UnknownMetricError(
            f"Unknown DB indicator.code: {db_code!r}. "
            f"Add reverse mapping to CODE_MAP_PYTHON_TO_DB."
        ) from exc


def species_python_to_db(species_code: str) -> str:
    """Translate a species code (alder_birch/pine/...) to DB ``vp_*`` indicator.code."""
    try:
        return SPECIES_CODE_MAP_PYTHON_TO_DB[species_code]
    except KeyError as exc:
        raise UnknownMetricError(
            f"Unknown Python species code: {species_code!r}. "
            f"Add it to SPECIES_CODE_MAP_PYTHON_TO_DB."
        ) from exc


def species_db_to_python(db_code: str) -> str:
    """Reverse: DB ``vp_*`` indicator.code → Python species code."""
    try:
        return SPECIES_CODE_MAP_DB_TO_PYTHON[db_code]
    except KeyError as exc:
        raise UnknownMetricError(
            f"Unknown DB species indicator.code: {db_code!r}. "
            f"Add reverse mapping to SPECIES_CODE_MAP_PYTHON_TO_DB."
        ) from exc
