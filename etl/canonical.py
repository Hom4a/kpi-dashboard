"""Canonical (single-value-per-fact) views over fact rows.

Selection rule: highest ``source_priority`` wins; ties broken by latest
``vintage_date``. This is what dashboards / execs should read.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import TypeVar

from .models import (
    AnimalValue,
    AnnualValue,
    MonthlyValue,
    ReferenceText,
    SalaryValue,
    SpeciesAnnual,
    SpeciesMonthly,
)

_F = TypeVar(
    "_F",
    AnnualValue,
    MonthlyValue,
    SpeciesAnnual,
    SpeciesMonthly,
)


def _pick_canonical(facts: Iterable[_F], key_fn) -> list[_F]:  # type: ignore[no-untyped-def]
    """Group by ``key_fn`` and keep one fact per group (priority, vintage)."""
    best: dict[object, _F] = {}
    for f in facts:
        k = key_fn(f)
        current = best.get(k)
        if current is None:
            best[k] = f
            continue
        # Higher priority wins; then newer vintage
        if (f.source_priority, f.vintage_date) > (
            current.source_priority,
            current.vintage_date,
        ):
            best[k] = f
    return list(best.values())


def canonical_annual(facts: Iterable[AnnualValue]) -> list[AnnualValue]:
    """One row per ``(metric_code, year)`` — highest priority, newest vintage."""
    return _pick_canonical(facts, lambda f: (f.metric_code, f.year))


def canonical_monthly(facts: Iterable[MonthlyValue]) -> list[MonthlyValue]:
    """One row per ``(metric_code, year, month)``."""
    return _pick_canonical(facts, lambda f: (f.metric_code, f.year, f.month))


def canonical_species_annual(facts: Iterable[SpeciesAnnual]) -> list[SpeciesAnnual]:
    """One row per ``(species, year)``."""
    return _pick_canonical(facts, lambda f: (f.species, f.year))


def canonical_species_monthly(
    facts: Iterable[SpeciesMonthly],
) -> list[SpeciesMonthly]:
    """One row per ``(species, year, month)``."""
    return _pick_canonical(facts, lambda f: (f.species, f.year, f.month))


def canonical_reference(
    facts: Iterable[ReferenceText],
) -> list[ReferenceText]:
    """One row per ``(category, year, month)`` — highest priority,
    newest vintage, smallest source_row, with deterministic ordering.

    Resolution rule (lexicographic):

        1. Highest ``source_priority`` wins.
        2. Tie-break by latest ``vintage_date``.
        3. Final tie-break by smallest ``source_row`` (first occurrence
           in source). If everything ties, input order decides — the
           earlier fact stays (the loop's ``>`` comparison preserves it).

    Inlines its own picker rather than reusing ``_pick_canonical`` because
    that helper does not consider ``source_row`` and we want the contract
    fully deterministic for reference data (where rerunning a parser on
    the same workbook must yield byte-identical output for diffing).

    Output is sorted by ``(category, year, month)``.
    """
    best: dict[tuple[str, int, int], ReferenceText] = {}
    for f in facts:
        k = (f.category, f.year, f.month)
        current = best.get(k)
        if current is None:
            best[k] = f
            continue
        # source_row is negated so that the lexicographic ``>`` favours the
        # smaller (earlier) row when priority and vintage are tied.
        if (f.source_priority, f.vintage_date, -f.source_row) > (
            current.source_priority,
            current.vintage_date,
            -current.source_row,
        ):
            best[k] = f
    return sorted(best.values(), key=lambda r: (r.category, r.year, r.month))


def canonical_salary(
    facts: Iterable[SalaryValue],
) -> list[SalaryValue]:
    """One row per ``(branch_name, year, month)`` — highest priority,
    newest vintage, smallest source_row, with deterministic ordering.

    Resolution rule (lexicographic):

        1. Highest ``source_priority`` wins.
        2. Tie-break by latest ``vintage_date``.
        3. Final tie-break by smallest ``source_row`` (first occurrence
           in source). If everything ties, input order decides — the
           earlier fact stays.

    Inlines its own picker (mirroring ``canonical_reference``) rather than
    reusing ``_pick_canonical`` so reruns over the same workbook produce
    byte-identical output for diffing.

    Output is sorted by ``(branch_name, year, month)``.
    """
    best: dict[tuple[str, int, int], SalaryValue] = {}
    for f in facts:
        k = (f.branch_name, f.year, f.month)
        current = best.get(k)
        if current is None:
            best[k] = f
            continue
        if (f.source_priority, f.vintage_date, -f.source_row) > (
            current.source_priority,
            current.vintage_date,
            -current.source_row,
        ):
            best[k] = f
    return sorted(best.values(), key=lambda r: (r.branch_name, r.year, r.month))


def canonical_animal(facts: Iterable[AnimalValue]) -> list[AnimalValue]:
    """One row per ``(species_name, year)`` — same 3-tier tie-break as
    canonical_salary / canonical_reference: priority DESC, vintage DESC,
    source_row ASC.

    Inlines its own picker (mirroring ``canonical_reference`` and
    ``canonical_salary``) rather than reusing ``_pick_canonical`` so
    reruns over the same workbook produce byte-identical output.

    Output is sorted by ``(species_name, year)``.
    """
    best: dict[tuple[str, int], AnimalValue] = {}
    for f in facts:
        k = (f.species_name, f.year)
        current = best.get(k)
        if current is None:
            best[k] = f
            continue
        if (f.source_priority, f.vintage_date, -f.source_row) > (
            current.source_priority,
            current.vintage_date,
            -current.source_row,
        ):
            best[k] = f
    return sorted(best.values(), key=lambda r: (r.species_name, r.year))
