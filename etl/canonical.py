"""Canonical (single-value-per-fact) views over fact rows.

Selection rule: highest ``source_priority`` wins; ties broken by latest
``vintage_date``. This is what dashboards / execs should read.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import TypeVar

from .models import AnnualValue, MonthlyValue, SpeciesAnnual, SpeciesMonthly

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
