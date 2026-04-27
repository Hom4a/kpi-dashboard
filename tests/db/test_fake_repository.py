"""``FakeRepository`` semantics — covers the contract on ``Repository.write_batch``."""
from __future__ import annotations

from datetime import datetime

from etl.db.batch import build_batch_from_canonical
from etl.db.fake import FakeRepository
from etl.models import AnnualValue, MonthlyValue, ReferenceText, SpeciesAnnual


def _annual(
    *,
    value: float | None = None,
    value_text: str | None = None,
    priority: int,
    vintage: datetime,
    source: str = "src.xlsx",
    metric: str = "payroll_fund_mln",
    year: int = 2025,
) -> AnnualValue:
    return AnnualValue(
        metric_code=metric,
        year=year,
        value=value,
        value_text=value_text,
        is_ytd=False,
        source_file=source,
        source_row=1,
        vintage_date=vintage,
        report_type="accounting_ytd" if priority == 20 else "operational",
        source_priority=priority,
    )


def _monthly(
    *,
    value: float | None = None,
    value_text: str | None = None,
    priority: int,
    vintage: datetime,
    metric: str = "revenue_total_mln",
    year: int = 2025,
    month: int = 3,
) -> MonthlyValue:
    return MonthlyValue(
        metric_code=metric,
        year=year,
        month=month,
        value=value,
        value_text=value_text,
        source_file="src.xlsx",
        source_row=1,
        vintage_date=vintage,
        report_type="operational",
        source_priority=priority,
    )


def _species(
    *,
    volume: float,
    price: float,
    priority: int,
    vintage: datetime,
    species: str = "oak",
    year: int = 2025,
) -> SpeciesAnnual:
    return SpeciesAnnual(
        species=species,
        year=year,
        volume_km3=volume,
        avg_price_grn=price,
        source_file="src.xlsx",
        source_row=1,
        vintage_date=vintage,
        report_type="accounting_ytd",
        source_priority=priority,
    )


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------

def test_write_single_batch_creates_canonical() -> None:
    repo = FakeRepository()
    fact = _annual(value=8169.65, priority=20, vintage=datetime(2026, 1, 31))
    batch = build_batch_from_canonical(
        source_file="2025_рік.xlsx",
        vintage_date=datetime(2026, 1, 31),
        annual=[fact],
    )

    result = repo.write_batch(batch)

    assert result.rows_to_revisions == 1
    assert result.rows_to_canonical == 1
    assert result.rows_unchanged == 0
    assert result.rows_superseded == 0

    canonical = repo.get_canonical_annual("payroll_fund_mln", 2025)
    assert canonical is not None
    assert canonical.value == 8169.65


def test_write_lower_priority_does_not_overwrite_canonical() -> None:
    repo = FakeRepository()

    high = _annual(value=100.0, priority=20, vintage=datetime(2026, 1, 31))
    repo.write_batch(
        build_batch_from_canonical(
            source_file="hi.xlsx",
            vintage_date=datetime(2026, 1, 31),
            annual=[high],
        )
    )

    low = _annual(value=999.0, priority=10, vintage=datetime(2026, 4, 10))
    result = repo.write_batch(
        build_batch_from_canonical(
            source_file="lo.xlsx",
            vintage_date=datetime(2026, 4, 10),
            annual=[low],
        )
    )

    assert result.rows_to_revisions == 1
    assert result.rows_to_canonical == 0
    assert result.rows_unchanged == 1
    assert result.rows_superseded == 0

    canonical = repo.get_canonical_annual("payroll_fund_mln", 2025)
    assert canonical is not None
    assert canonical.value == 100.0  # high-priority survives


def test_write_higher_priority_overwrites_and_marks_old_superseded() -> None:
    repo = FakeRepository()

    low = _annual(value=999.0, priority=10, vintage=datetime(2026, 4, 10))
    repo.write_batch(
        build_batch_from_canonical(
            source_file="lo.xlsx",
            vintage_date=datetime(2026, 4, 10),
            annual=[low],
        )
    )

    high = _annual(value=100.0, priority=20, vintage=datetime(2026, 1, 31))
    result = repo.write_batch(
        build_batch_from_canonical(
            source_file="hi.xlsx",
            vintage_date=datetime(2026, 1, 31),
            annual=[high],
        )
    )

    assert result.rows_to_revisions == 1
    assert result.rows_to_canonical == 1
    assert result.rows_superseded == 1

    canonical = repo.get_canonical_annual("payroll_fund_mln", 2025)
    assert canonical is not None
    assert canonical.value == 100.0


def test_write_idempotent_same_batch_twice() -> None:
    repo = FakeRepository()
    fact = _annual(value=42.0, priority=10, vintage=datetime(2026, 4, 10))
    batch = build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=datetime(2026, 4, 10),
        annual=[fact],
    )

    first = repo.write_batch(batch)
    second = repo.write_batch(batch)

    # First insert hits revisions and canonical
    assert first.rows_to_revisions == 1
    assert first.rows_to_canonical == 1
    # Second is a complete no-op (same fact signature)
    assert second.rows_to_revisions == 0
    # No keys touched → no canonical reapply
    assert second.rows_to_canonical == 0
    assert second.rows_unchanged == 0

    history = repo.get_revision_history("annual", "payroll_fund_mln", 2025)
    assert len(history) == 1


def test_get_revision_history_returns_all_versions_oldest_first() -> None:
    repo = FakeRepository()

    v1 = _annual(value=100.0, priority=10, vintage=datetime(2026, 1, 1))
    v2 = _annual(value=110.0, priority=10, vintage=datetime(2026, 2, 1))
    v3 = _annual(value=120.0, priority=20, vintage=datetime(2026, 3, 1))

    for fact in (v1, v2, v3):
        repo.write_batch(
            build_batch_from_canonical(
                source_file="src.xlsx",
                vintage_date=fact.vintage_date,
                annual=[fact],
            )
        )

    history = repo.get_revision_history("annual", "payroll_fund_mln", 2025)
    assert [f.value for f in history] == [100.0, 110.0, 120.0]


def test_canonical_resolution_uses_vintage_as_tie_breaker() -> None:
    """Same priority → newer vintage wins."""
    repo = FakeRepository()

    older = _annual(value=100.0, priority=10, vintage=datetime(2026, 1, 1))
    newer = _annual(value=200.0, priority=10, vintage=datetime(2026, 2, 1))

    repo.write_batch(
        build_batch_from_canonical(
            source_file="old.xlsx",
            vintage_date=older.vintage_date,
            annual=[older],
        )
    )
    repo.write_batch(
        build_batch_from_canonical(
            source_file="new.xlsx",
            vintage_date=newer.vintage_date,
            annual=[newer],
        )
    )

    canonical = repo.get_canonical_annual("payroll_fund_mln", 2025)
    assert canonical is not None
    assert canonical.value == 200.0


def test_monthly_and_species_independent_keys() -> None:
    """Different (kind, key) tuples don't collide."""
    repo = FakeRepository()

    m = _monthly(value=2488.16, priority=10, vintage=datetime(2025, 4, 10))
    sp = _species(volume=437.0, price=13082.6, priority=20, vintage=datetime(2026, 1, 31))

    repo.write_batch(
        build_batch_from_canonical(
            source_file="src.xlsx",
            vintage_date=datetime(2025, 4, 10),
            monthly=[m],
            species_annual=[sp],
        )
    )

    assert repo.get_canonical_monthly("revenue_total_mln", 2025, 3) is not None
    assert repo.get_canonical_species_annual("oak", 2025) is not None
    # Annual map untouched
    assert repo.get_canonical_annual("revenue_total_mln", 2025) is None


def test_species_monthly_round_trip() -> None:
    from etl.models import SpeciesMonthly

    repo = FakeRepository()
    fact = SpeciesMonthly(
        species="pine",
        year=2025,
        month=3,
        volume_km3=275.0,
        avg_price_grn=3149.0,
        source_file="src.xlsx",
        source_row=10,
        vintage_date=datetime(2025, 4, 10),
        report_type="operational",
        source_priority=10,
    )
    repo.write_batch(
        build_batch_from_canonical(
            source_file="src.xlsx",
            vintage_date=datetime(2025, 4, 10),
            species_monthly=[fact],
        )
    )
    canonical = repo.get_canonical_species_monthly("pine", 2025, 3)
    assert canonical is not None
    assert canonical.volume_km3 == 275.0
    assert canonical.avg_price_grn == 3149.0


# ---------------------------------------------------------------------
# Regression tests for FIX 1 / FIX 3 / value_text round-trip
# ---------------------------------------------------------------------

def test_idempotent_write_does_not_create_duplicate_revisions() -> None:
    """Re-writing identical batch is a no-op for revisions ledger (FIX 1).

    Even when the second batch comes from a different source file, the
    business-identity tuple (vintage, priority, value, ...) collides — so
    the FakeRepository's _seen set rejects the second insert. This mirrors
    the SQL partial unique index from migration 17.
    """
    repo = FakeRepository()
    fact = _annual(value=42.0, priority=10, vintage=datetime(2026, 4, 10))
    batch_a = build_batch_from_canonical(
        source_file="run_a.xlsx",
        vintage_date=datetime(2026, 4, 10),
        annual=[fact],
    )
    batch_b = build_batch_from_canonical(
        source_file="run_b.xlsx",  # different file, same business identity
        vintage_date=datetime(2026, 4, 10),
        annual=[fact],
    )

    res_a = repo.write_batch(batch_a)
    res_b = repo.write_batch(batch_b)

    assert res_a.rows_to_revisions == 1
    assert res_b.rows_to_revisions == 0  # collided on identity, no-op

    history = repo.get_revision_history("annual", "payroll_fund_mln", 2025)
    assert len(history) == 1


def test_upsert_overwrites_value_text_on_canonical_change() -> None:
    """value_text is replaced when canonical winner changes (FIX 3).

    Scenario mirrors fin_stability_coef in the «Основні показники» file:
    first the cell carries the pending text "до 01.03.2027" (low priority,
    operational); later an accounting_ytd close with a numeric value lands
    and must displace the text.
    """
    repo = FakeRepository()

    text_fact = _annual(
        value=None,
        value_text="до 01.03.2027",
        priority=10,
        vintage=datetime(2026, 1, 31),
        metric="fin_stability_coef",
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="t1.xlsx",
        vintage_date=text_fact.vintage_date,
        annual=[text_fact],
    ))

    canonical_text = repo.get_canonical_annual("fin_stability_coef", 2025)
    assert canonical_text is not None
    assert canonical_text.value is None
    assert canonical_text.value_text == "до 01.03.2027"

    numeric_fact = _annual(
        value=973.37,
        value_text=None,
        priority=20,  # accounting_ytd
        vintage=datetime(2026, 2, 28),
        metric="fin_stability_coef",
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="t2.xlsx",
        vintage_date=numeric_fact.vintage_date,
        annual=[numeric_fact],
    ))

    canonical_after = repo.get_canonical_annual("fin_stability_coef", 2025)
    assert canonical_after is not None
    assert canonical_after.value == 973.37
    assert canonical_after.value_text is None  # stale text was replaced


def test_text_only_annual_value_round_trips() -> None:
    """Pydantic model accepts value=None + value_text and FakeRepository
    stores both round-trip through the canonical lookup."""
    repo = FakeRepository()
    fact = _annual(
        value=None,
        value_text="до 25.04.2026",
        priority=10,
        vintage=datetime(2026, 1, 31),
        metric="fin_stability_coef",
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=fact.vintage_date,
        annual=[fact],
    ))
    canonical = repo.get_canonical_annual("fin_stability_coef", 2025)
    assert canonical is not None
    assert canonical.value is None
    assert canonical.value_text == "до 25.04.2026"


# ---------------------------------------------------------------------
# Reference text — canonical resolution + history
# ---------------------------------------------------------------------

def _reference(
    *,
    category: str = "subsistence_minimum",
    year: int = 2025,
    month: int = 0,
    content: str,
    priority: int,
    vintage: datetime,
    source_row: int = 92,
) -> ReferenceText:
    return ReferenceText(
        category=category,
        year=year,
        month=month,
        content=content,
        source_file="src.xlsx",
        source_row=source_row,
        vintage_date=vintage,
        report_type="accounting_ytd" if priority == 20 else "operational",
        source_priority=priority,
    )


def test_write_reference_creates_canonical() -> None:
    repo = FakeRepository()
    fact = _reference(
        content="Прожитковий мінімум - 3028 грн.",
        priority=10,
        vintage=datetime(2026, 1, 31),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=fact.vintage_date,
        reference=[fact],
    ))

    canonical = repo.get_canonical_reference("subsistence_minimum", 2025, 0)
    assert canonical is not None
    assert canonical.content == fact.content


def test_write_reference_supersedes_older_vintage() -> None:
    repo = FakeRepository()
    older = _reference(
        content="old content",
        priority=10,
        vintage=datetime(2026, 1, 31),
    )
    newer = _reference(
        content="new content",
        priority=10,
        vintage=datetime(2026, 4, 30),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="a.xlsx",
        vintage_date=older.vintage_date,
        reference=[older],
    ))
    res = repo.write_batch(build_batch_from_canonical(
        source_file="b.xlsx",
        vintage_date=newer.vintage_date,
        reference=[newer],
    ))

    assert res.rows_to_canonical == 1
    assert res.rows_superseded == 1
    canonical = repo.get_canonical_reference("subsistence_minimum", 2025, 0)
    assert canonical is not None
    assert canonical.content == "new content"


def test_write_reference_higher_priority_wins_over_newer_vintage() -> None:
    """Priority outranks vintage — accounting_ytd snapshot taken with an
    older vintage_date still beats a newer operational note."""
    repo = FakeRepository()

    operational_newer = _reference(
        content="operational note",
        priority=10,
        vintage=datetime(2026, 4, 30),
    )
    accounting_older = _reference(
        content="accounting close",
        priority=20,
        vintage=datetime(2026, 1, 31),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="a.xlsx",
        vintage_date=operational_newer.vintage_date,
        reference=[operational_newer],
    ))
    repo.write_batch(build_batch_from_canonical(
        source_file="b.xlsx",
        vintage_date=accounting_older.vintage_date,
        reference=[accounting_older],
    ))

    canonical = repo.get_canonical_reference("subsistence_minimum", 2025, 0)
    assert canonical is not None
    assert canonical.content == "accounting close"
    assert canonical.source_priority == 20


def test_get_revision_history_reference() -> None:
    repo = FakeRepository()
    v1 = _reference(
        content="content v1",
        priority=10,
        vintage=datetime(2026, 1, 31),
    )
    v2 = _reference(
        content="content v2",
        priority=10,
        vintage=datetime(2026, 3, 31),
    )
    for fact in (v1, v2):
        repo.write_batch(build_batch_from_canonical(
            source_file="src.xlsx",
            vintage_date=fact.vintage_date,
            reference=[fact],
        ))

    history = repo.get_revision_history(
        "reference", "subsistence_minimum", 2025, month=0
    )
    contents = [r.content for r in history]  # type: ignore[union-attr]
    assert contents == ["content v1", "content v2"]  # oldest first
