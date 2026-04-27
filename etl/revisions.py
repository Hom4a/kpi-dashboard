"""Revision history over fact rows.

For each ``(metric_code, year[, month])`` with more than one version,
build a ``Revision`` that shows all versions sorted by vintage, plus the
canonical winner and the delta from the previous vintage.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from .models import AnnualValue, MonthlyValue, ReportType


PeriodKind = Literal["annual", "monthly"]


@dataclass
class Version:
    value: float | None
    vintage_date: datetime
    report_type: ReportType
    source_file: str
    source_priority: int


@dataclass
class Revision:
    """One metric+period with multiple recorded values."""

    metric_code: str
    year: int
    month: int | None  # None for annual
    period_kind: PeriodKind
    versions: list[Version]
    canonical_value: float | None
    delta_from_previous: float | None
    is_meaningful: bool  # True if canonical differs from any earlier non-ties
    _rel_threshold: float = field(default=1e-9, repr=False)


def _meaningful(
    versions: list[Version], canonical: float | None, rel: float
) -> bool:
    """A revision is meaningful when at least one numeric version differs
    materially from the canonical. Text-only versions (``value is None``) are
    skipped — they don't have a numeric delta to compare. If the canonical
    itself is text-only, no numeric delta is meaningful."""
    if canonical is None:
        return False
    for v in versions:
        if v.value is None:
            continue
        if v.value == canonical:
            continue
        denom = max(abs(v.value), abs(canonical), 1.0)
        if abs(v.value - canonical) / denom > rel:
            return True
    return False


def _to_version(f: AnnualValue | MonthlyValue) -> Version:
    return Version(
        value=f.value,
        vintage_date=f.vintage_date,
        report_type=f.report_type,
        source_file=f.source_file,
        source_priority=f.source_priority,
    )


def _pick_canonical_value(versions: list[Version]) -> float | None:
    best = versions[0]
    for v in versions[1:]:
        if (v.source_priority, v.vintage_date) > (best.source_priority, best.vintage_date):
            best = v
    return best.value


def find_annual_revisions(
    facts: Iterable[AnnualValue], rel_threshold: float = 1e-9
) -> list[Revision]:
    """Build ``Revision`` rows for annual facts with ≥2 versions."""
    by_key: dict[tuple[str, int], list[AnnualValue]] = defaultdict(list)
    for f in facts:
        by_key[(f.metric_code, f.year)].append(f)

    out: list[Revision] = []
    for (code, year), group in by_key.items():
        if len(group) < 2:
            continue
        versions = sorted(
            (_to_version(f) for f in group), key=lambda v: v.vintage_date
        )
        canonical = _pick_canonical_value(versions)
        prev = versions[-2].value if len(versions) >= 2 else None
        delta = (
            (canonical - prev)
            if (canonical is not None and prev is not None)
            else None
        )
        out.append(
            Revision(
                metric_code=code,
                year=year,
                month=None,
                period_kind="annual",
                versions=versions,
                canonical_value=canonical,
                delta_from_previous=delta,
                is_meaningful=_meaningful(versions, canonical, rel_threshold),
            )
        )
    return out


def find_monthly_revisions(
    facts: Iterable[MonthlyValue], rel_threshold: float = 1e-9
) -> list[Revision]:
    """Build ``Revision`` rows for monthly facts with ≥2 versions."""
    by_key: dict[tuple[str, int, int], list[MonthlyValue]] = defaultdict(list)
    for f in facts:
        by_key[(f.metric_code, f.year, f.month)].append(f)

    out: list[Revision] = []
    for (code, year, month), group in by_key.items():
        if len(group) < 2:
            continue
        versions = sorted(
            (_to_version(f) for f in group), key=lambda v: v.vintage_date
        )
        canonical = _pick_canonical_value(versions)
        prev = versions[-2].value if len(versions) >= 2 else None
        delta = (
            (canonical - prev)
            if (canonical is not None and prev is not None)
            else None
        )
        out.append(
            Revision(
                metric_code=code,
                year=year,
                month=month,
                period_kind="monthly",
                versions=versions,
                canonical_value=canonical,
                delta_from_previous=delta,
                is_meaningful=_meaningful(versions, canonical, rel_threshold),
            )
        )
    return out
