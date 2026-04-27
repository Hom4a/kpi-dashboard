"""Derived metrics are computed post-canonical — never parsed from Excel."""
from __future__ import annotations

from pathlib import Path

import pytest

from etl.canonical import canonical_annual
from etl.derived import compute_derived_annual
from etl.metrics import is_ignored
from etl.parser_annual_monthly import parse_annual_monthly
from etl.parser_osnovni import parse_osnovni_annual

OSNOVNI = Path("raw_data/Основні_показники_березень_2026_остання.xlsx")
YEAR_2025 = Path("raw_data/2025_рік.xlsx")


def test_is_ignored_recognizes_derived_name() -> None:
    """Parser must silent-skip the Excel row for a derived metric."""
    assert is_ignored("Реалізовано на 1 штатного, грн")


def test_parsers_do_not_emit_derived() -> None:
    """Neither parser may produce a raw fact with code=revenue_per_employee_grn."""
    for r in (
        parse_osnovni_annual(OSNOVNI),
        parse_annual_monthly(YEAR_2025),
    ):
        codes = {a.metric_code for a in r.annual}
        assert "revenue_per_employee_grn" not in codes, (
            f"parser leaked derived metric; source={r.annual[0].source_file if r.annual else '?'}"
        )


def test_derived_revenue_per_employee_2025() -> None:
    """Post-canonical compute: revenue_per_employee = revenue_total × 1e6 / headcount."""
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI)
    combined = list(year.annual) + list(osnovni.annual)

    canon = canonical_annual(combined)
    derived = compute_derived_annual(canon)

    found = [
        d for d in derived
        if d.metric_code == "revenue_per_employee_grn" and d.year == 2025
    ]
    assert len(found) == 1, f"expected exactly one derived row, got {len(found)}"
    d = found[0]
    assert d.source_file == "(derived)"
    assert d.source_priority == 99

    # Spot-check formula: rev_total × 1e6 / headcount
    rev = next(a for a in canon if a.metric_code == "revenue_total_mln" and a.year == 2025)
    hc = next(a for a in canon if a.metric_code == "headcount" and a.year == 2025)
    expected = rev.value * 1_000_000 / hc.value
    assert d.value == pytest.approx(expected, rel=1e-12)


def test_derived_is_single_version_no_revision() -> None:
    """Because derived runs on canonical inputs, it must yield exactly one
    version per (metric, year) — no spurious revision history.
    """
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI)
    combined = list(year.annual) + list(osnovni.annual)

    canon = canonical_annual(combined)
    derived = compute_derived_annual(canon)

    # Each (metric_code, year) appears at most once in derived output
    keys = [(d.metric_code, d.year) for d in derived]
    assert len(keys) == len(set(keys)), f"duplicate derived keys: {keys}"
