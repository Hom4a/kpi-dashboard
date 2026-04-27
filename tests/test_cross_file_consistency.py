"""Cross-file consistency via ``find_annual_divergence``.

Divergence policy (finance-dept rules 4 & 5):
  - Different-priority sources disagreeing is NOT a divergence — it's an
    encoded hierarchy (accounting_ytd > operational > interim).
  - Same-priority sources disagreeing ABOVE 1% relative = true divergence.
    These get surfaced to admins; business owner resolves the source.
  - Same-priority sources within 1% = acceptable noise from different
    computation methods (e.g. derived per-employee from slightly different
    headcount averaging).

This test ensures no true divergence is silently accepted.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from etl.divergence import find_annual_divergence
from etl.parser_annual_monthly import parse_annual_monthly
from etl.parser_osnovni import parse_osnovni_annual

OSNOVNI = Path("raw_data/Основні_показники_березень_2026_остання.xlsx")
YEAR_2025 = Path("raw_data/2025_рік.xlsx")


def test_no_true_divergence_above_one_percent() -> None:
    """When two operational-priority (10) sources carry 2025 annuals,
    any disagreement ≥1% must surface. Anything below 1% is tolerable."""
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI)
    combined = list(year.annual) + list(osnovni.annual)

    divs = find_annual_divergence(combined, rel_threshold=0.01)
    if divs:
        lines = [
            f"  {d.metric_code:30}  types={list(d.values)}  values={list(d.values.values())}  "
            f"abs={d.max_abs_diff:.4f}  rel={d.max_rel_diff:.2%}"
            for d in divs
        ]
        pytest.fail(
            "\n=== TRUE CROSS-REPORT DIVERGENCE (≥1%) ===\n"
            + "\n".join(lines)
            + "\nThis is a data-level issue. Surface to finance-dept owner."
        )


def test_has_overlap_between_sources() -> None:
    """Baseline: both files must carry a non-empty intersection of 2025 metrics."""
    year = parse_annual_monthly(YEAR_2025)
    osnovni = parse_osnovni_annual(OSNOVNI)
    y_codes = {a.metric_code for a in year.annual if a.year == 2025}
    o_codes = {a.metric_code for a in osnovni.annual if a.year == 2025 and not a.is_ytd}
    shared = sorted(y_codes & o_codes)
    assert len(shared) >= 10, f"cross-file overlap too small: {shared}"
