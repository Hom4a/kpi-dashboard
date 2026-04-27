"""Cross-report divergence detection.

A divergence is a ``(metric_code, year[, month])`` where two or more facts
with the **same highest** ``source_priority`` but different ``report_type``
disagree by more than ``rel_threshold`` (default 1%).

Different priorities are NOT a divergence — the model already encodes a
hierarchy (e.g. accounting_ytd > operational monthly); canonical view
handles that cleanly.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from .models import AnnualValue, MonthlyValue, ReportType


@dataclass
class Divergence:
    metric_code: str
    year: int
    month: int | None
    values: dict[ReportType, float]
    max_abs_diff: float
    max_rel_diff: float


def _max_diffs(values: list[float]) -> tuple[float, float]:
    lo, hi = min(values), max(values)
    abs_d = hi - lo
    denom = max(abs(hi), abs(lo), 1.0)
    return abs_d, abs_d / denom


def find_annual_divergence(
    facts: Iterable[AnnualValue], rel_threshold: float = 0.01
) -> list[Divergence]:
    by_key: dict[tuple[str, int], list[AnnualValue]] = defaultdict(list)
    for f in facts:
        by_key[(f.metric_code, f.year)].append(f)

    out: list[Divergence] = []
    for (code, year), group in by_key.items():
        if len(group) < 2:
            continue
        max_p = max(f.source_priority for f in group)
        top = [f for f in group if f.source_priority == max_p]
        if len({f.report_type for f in top}) < 2:
            continue
        # Text-only facts have no numeric to compare — they cannot create a divergence.
        numeric_top = [f for f in top if f.value is not None]
        if len(numeric_top) < 2:
            continue
        values = [f.value for f in numeric_top if f.value is not None]
        abs_d, rel_d = _max_diffs(values)
        if rel_d <= rel_threshold:
            continue
        out.append(
            Divergence(
                metric_code=code,
                year=year,
                month=None,
                values={
                    f.report_type: f.value
                    for f in numeric_top
                    if f.value is not None
                },
                max_abs_diff=abs_d,
                max_rel_diff=rel_d,
            )
        )
    return out


def find_monthly_divergence(
    facts: Iterable[MonthlyValue], rel_threshold: float = 0.01
) -> list[Divergence]:
    by_key: dict[tuple[str, int, int], list[MonthlyValue]] = defaultdict(list)
    for f in facts:
        by_key[(f.metric_code, f.year, f.month)].append(f)

    out: list[Divergence] = []
    for (code, year, month), group in by_key.items():
        if len(group) < 2:
            continue
        max_p = max(f.source_priority for f in group)
        top = [f for f in group if f.source_priority == max_p]
        if len({f.report_type for f in top}) < 2:
            continue
        numeric_top = [f for f in top if f.value is not None]
        if len(numeric_top) < 2:
            continue
        values = [f.value for f in numeric_top if f.value is not None]
        abs_d, rel_d = _max_diffs(values)
        if rel_d <= rel_threshold:
            continue
        out.append(
            Divergence(
                metric_code=code,
                year=year,
                month=month,
                values={
                    f.report_type: f.value
                    for f in numeric_top
                    if f.value is not None
                },
                max_abs_diff=abs_d,
                max_rel_diff=rel_d,
            )
        )
    return out
