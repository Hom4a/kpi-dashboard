"""Revision / priority / divergence behavior tests.

Covers the Finance-dept business rules:
  - canonical view prefers higher ``source_priority``
  - accounting_ytd (col N) wins over sum of operational monthlies
  - loading two sources of the same period yields a revision history
  - monthly (operational) vs annual (accounting_ytd) is NOT a divergence —
    it's an encoded hierarchy
"""
from __future__ import annotations

from pathlib import Path

import pytest

from etl.canonical import canonical_annual, canonical_monthly
from etl.divergence import find_annual_divergence, find_monthly_divergence
from etl.parser_annual_monthly import parse_annual_monthly
from etl.parser_osnovni import parse_osnovni_annual
from etl.revisions import find_annual_revisions, find_monthly_revisions

OSNOVNI_FINAL = Path("raw_data/Основні_показники_березень_2026_остання.xlsx")
OSNOVNI_INTERIM = Path("raw_data/Основні_показники_проміжний_березень_2026.xlsx")
YEAR_2025 = Path("raw_data/2025_рік.xlsx")


# ---------------------------------------------------------------------------
# Rule 2: higher-priority source wins in canonical view
# ---------------------------------------------------------------------------

def test_vintage_priority_operational_over_interim() -> None:
    """«остання» (operational, p=10) must override «проміжний» (interim, p=5).

    Order of loading is irrelevant: priority + vintage decide.
    """
    interim = parse_osnovni_annual(OSNOVNI_INTERIM)
    final = parse_osnovni_annual(OSNOVNI_FINAL)

    # Load interim LAST — canonical view should still pick the operational file.
    all_monthly = list(final.monthly) + list(interim.monthly)
    canon = {
        (m.metric_code, m.year, m.month): m for m in canonical_monthly(all_monthly)
    }

    # Pick a metric that exists in both and has a march_2026 value.
    key = ("revenue_total_mln", 2026, 3)
    picked = canon.get(key)
    assert picked is not None, f"canonical missing {key}"
    assert picked.report_type == "operational", (
        f"expected operational, got {picked.report_type} ({picked.source_file})"
    )
    assert picked.source_priority == 10


# ---------------------------------------------------------------------------
# Rule 4: accounting_ytd wins over sum of monthlies
# ---------------------------------------------------------------------------

def test_ytd_priority_wins_over_monthly_sum_illusion() -> None:
    """For 2025_рік.xlsx, canonical annual for revenue_total_mln must be the
    YTD cell (29 870.53), not the sum of 12 monthlies (≈29 879.21).
    """
    r = parse_annual_monthly(YEAR_2025)
    canon = {
        (a.metric_code, a.year): a for a in canonical_annual(r.annual)
    }
    picked = canon.get(("revenue_total_mln", 2025))
    assert picked is not None
    assert picked.report_type == "accounting_ytd"
    assert picked.source_priority == 20
    assert picked.value == pytest.approx(29870.53401882, rel=1e-9)


# ---------------------------------------------------------------------------
# Rule 3 (admin view): revision history is discoverable
# ---------------------------------------------------------------------------

def test_revision_tracking_has_entry_for_2025_ytd() -> None:
    """Both 2025_рік.xlsx and Основні_показники_березень_2026_остання.xlsx
    report 2025 annual revenue_total_mln. find_annual_revisions should see
    2+ versions and build a Revision row.
    """
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI_FINAL)
    combined = list(year.annual) + list(osnovni.annual)
    revisions = find_annual_revisions(combined)

    match = [
        r for r in revisions
        if r.metric_code == "revenue_total_mln" and r.year == 2025
    ]
    assert len(match) == 1, "expected exactly one revision for revenue_total_mln/2025"
    rev = match[0]
    assert len(rev.versions) >= 2, "must have ≥2 versions tracked"
    # Both files carry 29870.53 → is_meaningful should be False
    assert not rev.is_meaningful, (
        f"expected identical versions to be non-meaningful, got versions: "
        f"{[v.value for v in rev.versions]}"
    )


# ---------------------------------------------------------------------------
# Rule 4 / 5: no false divergence between monthly operational and YTD accounting
# ---------------------------------------------------------------------------

def test_no_false_cross_report_divergence_annual() -> None:
    """Loading 2025_рік.xlsx alone gives ``accounting_ytd`` annuals and
    ``operational`` monthlies — find_annual_divergence must return empty
    (different priorities — it's hierarchy, not divergence).
    """
    r = parse_annual_monthly(YEAR_2025)
    divs = find_annual_divergence(r.annual)
    # No two equal-priority annual facts for the same (metric, year) → empty.
    assert divs == [], f"unexpected annual divergence: {divs}"


def test_no_false_cross_report_divergence_combined() -> None:
    """Loading yearly file + osnovni together should also not emit false
    divergences: both report 2025 YTD with matching values."""
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI_FINAL)
    combined = list(year.annual) + list(osnovni.annual)
    divs = find_annual_divergence(combined, rel_threshold=0.01)
    # Acceptable: divergences limited to values that genuinely differ by >1%.
    # revenue_per_employee_grn is known to differ (~0.37%), below 1% threshold,
    # so it should be filtered out.
    assert divs == [], f"unexpected combined divergence: {divs}"


def test_monthly_divergence_empty_for_single_source() -> None:
    """No monthly divergence inside a single-source parse."""
    r = parse_annual_monthly(YEAR_2025)
    assert find_monthly_divergence(r.monthly) == []
