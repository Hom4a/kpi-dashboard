"""``FakeRepository`` semantics — covers the contract on ``Repository.write_batch``."""
from __future__ import annotations

from datetime import datetime

import pytest

from etl.db.batch import build_batch_from_canonical
from etl.db.fake import FakeRepository
from etl.models import (
    AnimalValue,
    AnnualValue,
    MonthlyValue,
    ReferenceText,
    SalaryValue,
    SpeciesAnnual,
)


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


# ---------------------------------------------------------------------
# Salary tests (sub-step 5.4.4.d) — mirror reference branch architecture
# ---------------------------------------------------------------------

def _salary(
    *,
    branch_name: str = "Карпатський лісовий офіс",
    year: int = 2025,
    month: int = 1,
    salary_uah: float | None = 25000.0,
    region_avg_uah: float | None = 22000.0,
    priority: int = 10,
    vintage: datetime | None = None,
    source_row: int = 70,
) -> SalaryValue:
    return SalaryValue(
        branch_name=branch_name,
        year=year,
        month=month,
        salary_uah=salary_uah,
        region_avg_uah=region_avg_uah,
        source_file="2025_рік.xlsx",
        source_row=source_row,
        vintage_date=vintage or datetime(2026, 1, 31),
        report_type="operational",
        source_priority=priority,
    )


def test_salary_write_idempotent() -> None:
    """Re-writing the same SalaryValue is a no-op."""
    repo = FakeRepository()
    fact = _salary(salary_uah=25000.0)
    batch = build_batch_from_canonical(
        source_file="2025_рік.xlsx",
        vintage_date=fact.vintage_date,
        salary=[fact],
    )

    r1 = repo.write_batch(batch)
    r2 = repo.write_batch(batch)

    assert r1.rows_to_revisions == 1
    assert r2.rows_to_revisions == 0  # signature already in _seen
    history = repo.get_revision_history(
        "salary", "Карпатський лісовий офіс", 2025, month=1
    )
    assert len(history) == 1


def test_salary_canonical_resolution_priority() -> None:
    """Higher source_priority wins for the same (branch, year, month)."""
    repo = FakeRepository()
    op = _salary(salary_uah=25000.0, priority=10)
    acct = _salary(
        salary_uah=27500.0, priority=20,
        vintage=datetime(2026, 1, 31),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=op.vintage_date,
        salary=[op, acct],
    ))

    canon = repo.get_canonical_salary("Карпатський лісовий офіс", 2025, 1)
    assert canon is not None
    assert canon.salary_uah == 27500.0
    assert canon.source_priority == 20


def test_salary_canonical_resolution_vintage_tiebreaker() -> None:
    """Same priority — newer vintage_date wins."""
    repo = FakeRepository()
    older = _salary(
        salary_uah=24000.0, priority=10,
        vintage=datetime(2026, 1, 31),
    )
    newer = _salary(
        salary_uah=26000.0, priority=10,
        vintage=datetime(2026, 4, 25),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=newer.vintage_date,
        salary=[older, newer],
    ))

    canon = repo.get_canonical_salary("Карпатський лісовий офіс", 2025, 1)
    assert canon is not None
    assert canon.salary_uah == 26000.0


def test_salary_canonical_resolution_source_row_tiebreaker() -> None:
    """Same priority + same vintage — smaller source_row wins."""
    repo = FakeRepository()
    later_row = _salary(salary_uah=24000.0, source_row=85)
    earlier_row = _salary(salary_uah=26000.0, source_row=70)
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=earlier_row.vintage_date,
        salary=[later_row, earlier_row],
    ))

    canon = repo.get_canonical_salary("Карпатський лісовий офіс", 2025, 1)
    assert canon is not None
    assert canon.salary_uah == 26000.0  # source_row=70 wins over 85


def test_salary_get_revision_history_oldest_first() -> None:
    """Multiple SalaryValues for the same key with different vintages
    return all rows ordered oldest-first."""
    repo = FakeRepository()
    facts = [
        _salary(
            salary_uah=v,
            vintage=datetime(2026, m, 28),
        )
        for v, m in [(24000.0, 1), (25000.0, 2), (26000.0, 3)]
    ]
    for f in facts:
        repo.write_batch(build_batch_from_canonical(
            source_file="src.xlsx",
            vintage_date=f.vintage_date,
            salary=[f],
        ))

    history = repo.get_revision_history(
        "salary", "Карпатський лісовий офіс", 2025, month=1
    )
    salaries = [s.salary_uah for s in history]  # type: ignore[union-attr]
    assert salaries == [24000.0, 25000.0, 26000.0]  # oldest first


def test_salary_revision_history_invalid_kind_still_raises() -> None:
    """get_revision_history rejects unknown kind; 'salary' is now valid."""
    repo = FakeRepository()
    with pytest.raises(ValueError):
        repo.get_revision_history("invalid", "X", 2025, month=1)
    # Sanity: 'salary' does NOT raise, even on empty repo.
    assert repo.get_revision_history("salary", "X", 2025, month=1) == []


def test_salary_get_canonical_returns_none_when_absent() -> None:
    """Empty repo yields None for any (branch, year, month) lookup."""
    repo = FakeRepository()
    assert repo.get_canonical_salary("Карпатський лісовий офіс", 2025, 1) is None


def test_salary_distinct_branches_with_similar_names() -> None:
    """Verbatim branch names are NOT collapsed — three distinct strings
    produce three distinct canonical rows.

    This is the architectural invariant from the 5.4.4 reconnaissance:
    DB has separate UUIDs for ``Карпатський лісовий офіс`` (regional level)
    vs ``Філія "Карпатський лісовий офіс"`` (subsidiary). Repository must
    keep them separate; alias normalization happens later, in the resolver
    layer (5.4.4.e).
    """
    repo = FakeRepository()
    a = _salary(branch_name="Карпатський лісовий офіс", salary_uah=27796.0)
    b = _salary(branch_name='Філія "Карпатський лісовий офіс"', salary_uah=28779.0)
    c = _salary(branch_name='філія "Карпатський лісовий офіс"', salary_uah=29000.0)

    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=a.vintage_date,
        salary=[a, b, c],
    ))

    canon_a = repo.get_canonical_salary("Карпатський лісовий офіс", 2025, 1)
    canon_b = repo.get_canonical_salary('Філія "Карпатський лісовий офіс"', 2025, 1)
    canon_c = repo.get_canonical_salary('філія "Карпатський лісовий офіс"', 2025, 1)

    assert canon_a is not None and canon_a.salary_uah == 27796.0
    assert canon_b is not None and canon_b.salary_uah == 28779.0
    assert canon_c is not None and canon_c.salary_uah == 29000.0
    # All three coexist as separate rows in the canonical store.
    assert {canon_a.branch_name, canon_b.branch_name, canon_c.branch_name} == {
        "Карпатський лісовий офіс",
        'Філія "Карпатський лісовий офіс"',
        'філія "Карпатський лісовий офіс"',
    }


# ---------------------------------------------------------------------
# Animal tests (sub-step 5.5.5.a) — mirror salary architecture
# ---------------------------------------------------------------------

def _animal(
    *,
    species_name: str = "Олень благор.",
    year: int = 2022,
    population: int = 3787,
    limit_qty: int | None = None,
    priority: int = 10,
    vintage: datetime | None = None,
    source_row: int = 43,
) -> AnimalValue:
    return AnimalValue(
        species_name=species_name,
        year=year,
        population=population,
        limit_qty=limit_qty,
        raw_text=f"{species_name} {population}/" + ("*" if limit_qty is None else str(limit_qty)),
        source_file="2025_рік.xlsx",
        source_row=source_row,
        vintage_date=vintage or datetime(2026, 1, 31),
        report_type="operational",
        source_priority=priority,
    )


def test_animal_write_idempotent() -> None:
    """Re-writing the same AnimalValue is a no-op."""
    repo = FakeRepository()
    fact = _animal(population=3787)
    batch = build_batch_from_canonical(
        source_file="2025_рік.xlsx",
        vintage_date=fact.vintage_date,
        animal=[fact],
    )

    r1 = repo.write_batch(batch)
    r2 = repo.write_batch(batch)

    assert r1.rows_to_revisions == 1
    assert r2.rows_to_revisions == 0
    history = repo.get_revision_history("animal", "Олень благор.", 2022)
    assert len(history) == 1


def test_animal_canonical_resolution_priority() -> None:
    """Higher source_priority wins for the same (species, year)."""
    repo = FakeRepository()
    op = _animal(population=3700, priority=10)
    acct = _animal(
        population=3787, priority=20,
        vintage=datetime(2026, 1, 31),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=op.vintage_date,
        animal=[op, acct],
    ))

    canon = repo.get_canonical_animal("Олень благор.", 2022)
    assert canon is not None
    assert canon.population == 3787
    assert canon.source_priority == 20


def test_animal_canonical_resolution_vintage_tiebreaker() -> None:
    """Same priority — newer vintage_date wins."""
    repo = FakeRepository()
    older = _animal(
        population=3700, priority=10,
        vintage=datetime(2026, 1, 31),
    )
    newer = _animal(
        population=3787, priority=10,
        vintage=datetime(2026, 4, 25),
    )
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=newer.vintage_date,
        animal=[older, newer],
    ))

    canon = repo.get_canonical_animal("Олень благор.", 2022)
    assert canon is not None
    assert canon.population == 3787


def test_animal_canonical_resolution_source_row_tiebreaker() -> None:
    """Same priority + same vintage — smaller source_row wins."""
    repo = FakeRepository()
    later = _animal(population=3700, source_row=50)
    earlier = _animal(population=3787, source_row=43)
    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=earlier.vintage_date,
        animal=[later, earlier],
    ))

    canon = repo.get_canonical_animal("Олень благор.", 2022)
    assert canon is not None
    assert canon.population == 3787  # source_row=43 wins over 50


def test_animal_get_revision_history_oldest_first() -> None:
    """Multiple AnimalValues for the same key with different vintages
    return all rows ordered oldest-first."""
    repo = FakeRepository()
    facts = [
        _animal(
            population=p,
            vintage=datetime(2026, m, 28),
        )
        for p, m in [(3700, 1), (3750, 2), (3787, 3)]
    ]
    for f in facts:
        repo.write_batch(build_batch_from_canonical(
            source_file="src.xlsx",
            vintage_date=f.vintage_date,
            animal=[f],
        ))

    history = repo.get_revision_history("animal", "Олень благор.", 2022)
    populations = [a.population for a in history]  # type: ignore[union-attr]
    assert populations == [3700, 3750, 3787]


def test_animal_revision_history_invalid_kind_still_raises() -> None:
    """get_revision_history rejects unknown kind; 'animal' is now valid."""
    repo = FakeRepository()
    with pytest.raises(ValueError):
        repo.get_revision_history("invalid", "X", 2022)
    # Sanity: 'animal' does NOT raise on empty repo.
    assert repo.get_revision_history("animal", "X", 2022) == []


def test_animal_get_canonical_returns_none_when_absent() -> None:
    """Empty repo yields None for any (species, year) lookup."""
    repo = FakeRepository()
    assert repo.get_canonical_animal("Олень благор.", 2022) is None


def test_animal_distinct_species_with_similar_names() -> None:
    """Verbatim species names are NOT collapsed by the FakeRepository.

    Three distinct strings produce three distinct canonical rows. The
    abbreviated 'Олень благор.' and the full 'Олень благородний' map
    to the same animal_species.id only at the postgres-resolver layer
    (5.5.5.b+); the in-memory store keeps them separate.
    """
    repo = FakeRepository()
    a = _animal(species_name="Олень благор.", population=3787)
    b = _animal(species_name="Олень благородний", population=3787)
    c = _animal(species_name="Олень плямистий", population=1025)

    repo.write_batch(build_batch_from_canonical(
        source_file="src.xlsx",
        vintage_date=a.vintage_date,
        animal=[a, b, c],
    ))

    canon_a = repo.get_canonical_animal("Олень благор.", 2022)
    canon_b = repo.get_canonical_animal("Олень благородний", 2022)
    canon_c = repo.get_canonical_animal("Олень плямистий", 2022)

    assert canon_a is not None and canon_a.population == 3787
    assert canon_b is not None and canon_b.population == 3787
    assert canon_c is not None and canon_c.population == 1025
    assert {canon_a.species_name, canon_b.species_name, canon_c.species_name} == {
        "Олень благор.", "Олень благородний", "Олень плямистий",
    }
