"""``WriteBatch`` builder behaviour."""
from __future__ import annotations

from datetime import datetime

from etl.db.batch import build_batch_from_canonical
from etl.models import AnnualValue


def _annual(value: float | None = 100.0) -> AnnualValue:
    return AnnualValue(
        metric_code="payroll_fund_mln",
        year=2025,
        value=value,
        is_ytd=False,
        source_file="test.xlsx",
        source_row=5,
        vintage_date=datetime(2026, 1, 31),
        report_type="accounting_ytd",
        source_priority=20,
    )


def test_build_batch_preserves_facts() -> None:
    a = _annual(100.0)
    b = _annual(200.0)
    batch = build_batch_from_canonical(
        source_file="test.xlsx",
        vintage_date=datetime(2026, 1, 31),
        annual=[a, b],
    )
    assert batch.source_file == "test.xlsx"
    assert batch.vintage_date == datetime(2026, 1, 31)
    assert batch.annual == [a, b]
    assert batch.monthly == []
    assert batch.species_annual == []
    assert batch.species_monthly == []


def test_build_batch_id_is_unique_per_call() -> None:
    b1 = build_batch_from_canonical(
        source_file="x.xlsx", vintage_date=datetime(2026, 1, 31)
    )
    b2 = build_batch_from_canonical(
        source_file="x.xlsx", vintage_date=datetime(2026, 1, 31)
    )
    assert b1.batch_id != b2.batch_id


def test_build_batch_defaults_to_empty_lists() -> None:
    batch = build_batch_from_canonical(
        source_file="x.xlsx", vintage_date=datetime(2026, 1, 31)
    )
    assert batch.annual == []
    assert batch.monthly == []
    assert batch.species_annual == []
    assert batch.species_monthly == []
