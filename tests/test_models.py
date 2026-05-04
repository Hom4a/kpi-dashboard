"""SalaryValue model contract — month range, optional uah fields, branch_name verbatim."""
from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError

from etl.models import SalaryValue


def _base() -> SalaryValue:
    """A valid SalaryValue used as a starting point for state-mutation tests.

    Validation-failure tests build their own constructor call so the bad
    field is type-checked at the call site, not laundered through a copy.
    """
    return SalaryValue(
        branch_name="Карпатський лісовий офіс",
        year=2025,
        month=1,
        salary_uah=42000.0,
        region_avg_uah=38000.0,
        source_file="raw_data/2025_рік.xlsx",
        source_row=70,
        vintage_date=datetime(2026, 4, 25, 12, 0, 0),
        report_type="operational",
        source_priority=10,
    )


def test_salary_value_basic_construction() -> None:
    """Happy-path: full row constructs and preserves all fields."""
    sv = _base()
    assert sv.branch_name == "Карпатський лісовий офіс"
    assert sv.year == 2025
    assert sv.month == 1
    assert sv.salary_uah == 42000.0
    assert sv.region_avg_uah == 38000.0
    assert sv.report_type == "operational"
    assert sv.source_priority == 10


def test_salary_value_month_range_accepts_zero_through_twelve() -> None:
    """month=0 (annual avg) and month=12 (December) are both valid extremes.

    Re-runs the constructor for each value so Pydantic's ``ge``/``le``
    validators actually fire — ``model_copy`` in v2 does not re-validate.
    """
    for valid_month in (0, 12):
        sv = SalaryValue(
            branch_name="Карпатський лісовий офіс",
            year=2025,
            month=valid_month,
            salary_uah=42000.0,
            region_avg_uah=38000.0,
            source_file="raw_data/2025_рік.xlsx",
            source_row=70,
            vintage_date=datetime(2026, 4, 25, 12, 0, 0),
            report_type="operational",
            source_priority=10,
        )
        assert sv.month == valid_month


def test_salary_value_month_range_rejects_thirteen() -> None:
    """month=13 (would-be YTD) is rejected — salary has no YTD column."""
    with pytest.raises(ValidationError):
        SalaryValue(
            branch_name="Карпатський лісовий офіс",
            year=2025,
            month=13,
            salary_uah=42000.0,
            region_avg_uah=38000.0,
            source_file="raw_data/2025_рік.xlsx",
            source_row=70,
            vintage_date=datetime(2026, 4, 25, 12, 0, 0),
            report_type="operational",
            source_priority=10,
        )


def test_salary_value_month_range_rejects_negative() -> None:
    """Negative months are rejected (no semantics, parser bug guard)."""
    with pytest.raises(ValidationError):
        SalaryValue(
            branch_name="Карпатський лісовий офіс",
            year=2025,
            month=-1,
            salary_uah=42000.0,
            region_avg_uah=38000.0,
            source_file="raw_data/2025_рік.xlsx",
            source_row=70,
            vintage_date=datetime(2026, 4, 25, 12, 0, 0),
            report_type="operational",
            source_priority=10,
        )


def test_salary_value_both_uah_fields_can_be_none() -> None:
    """Older formats / missing region row → both numerics may be None."""
    sv = SalaryValue(
        branch_name="Карпатський лісовий офіс",
        year=2025,
        month=1,
        salary_uah=None,
        region_avg_uah=None,
        source_file="raw_data/2025_рік.xlsx",
        source_row=70,
        vintage_date=datetime(2026, 4, 25, 12, 0, 0),
        report_type="operational",
        source_priority=10,
    )
    assert sv.salary_uah is None
    assert sv.region_avg_uah is None


def test_salary_value_branch_name_preserves_quotes() -> None:
    """Verbatim source text — repository layer normalises, parser does not."""
    raw = 'Філія "Карпатський лісовий офіс"'
    sv = SalaryValue(
        branch_name=raw,
        year=2025,
        month=1,
        salary_uah=42000.0,
        region_avg_uah=38000.0,
        source_file="raw_data/2025_рік.xlsx",
        source_row=70,
        vintage_date=datetime(2026, 4, 25, 12, 0, 0),
        report_type="operational",
        source_priority=10,
    )
    assert sv.branch_name == raw  # quotes intact, no trim, no normalise
