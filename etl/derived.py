"""Derived metrics — computed AFTER canonical resolution, not parsed.

Each derived rule takes the canonical ``dict[(code, year)] → AnnualValue``
(already deduplicated across reports) and produces a new ``AnnualValue``
that is itself canonical — one version per (metric, year).

Why post-canonical? A derived value computed on raw multi-source facts
would duplicate itself once per source and pollute the revision history
with spurious "differences". Computing from canonical inputs yields a
single, deterministic result.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from .models import AnnualValue

DERIVED_SOURCE_FILE = "(derived)"
DERIVED_REPORT_TYPE = "operational"
DERIVED_PRIORITY = 99  # Above any raw source; derived is ground-truth.


@dataclass
class DerivedRule:
    """A recipe for producing one derived metric from other canonicals."""

    metric_code: str
    inputs: tuple[str, ...]  # required canonical metric codes
    compute: Callable[[dict[str, AnnualValue]], float | None]
    description: str


def _revenue_per_employee(ctx: dict[str, AnnualValue]) -> float | None:
    """``revenue_total_mln × 1_000_000 / headcount`` (UAH per employee)."""
    rev = ctx.get("revenue_total_mln")
    hc = ctx.get("headcount")
    if rev is None or hc is None:
        return None
    if rev.value is None or hc.value is None or hc.value == 0:
        return None
    return rev.value * 1_000_000 / hc.value


DERIVED_RULES: tuple[DerivedRule, ...] = (
    DerivedRule(
        metric_code="revenue_per_employee_grn",
        inputs=("revenue_total_mln", "headcount"),
        compute=_revenue_per_employee,
        description="Реалізовано на 1 штатного, грн = revenue_total × 1e6 / headcount",
    ),
)


def compute_derived_annual(
    canonical_facts: Iterable[AnnualValue],
) -> list[AnnualValue]:
    """Return derived annual facts computed from already-canonical inputs.

    Called by the pipeline as:
        canon = canonical_annual(raw_facts)
        derived = compute_derived_annual(canon)
        final = canon + derived
    """
    # Group canonical facts by year → {metric_code: AnnualValue}.
    by_year: dict[int, dict[str, AnnualValue]] = {}
    for f in canonical_facts:
        by_year.setdefault(f.year, {})[f.metric_code] = f

    out: list[AnnualValue] = []
    for year, ctx in by_year.items():
        for rule in DERIVED_RULES:
            if not all(code in ctx for code in rule.inputs):
                continue  # inputs not available → skip silently
            value = rule.compute(ctx)
            if value is None:
                continue
            # Derive vintage = latest of the inputs used
            vintage = max(ctx[code].vintage_date for code in rule.inputs)
            out.append(
                AnnualValue(
                    metric_code=rule.metric_code,
                    year=year,
                    value=value,
                    is_ytd=False,
                    source_file=DERIVED_SOURCE_FILE,
                    source_row=0,
                    vintage_date=vintage,
                    report_type=DERIVED_REPORT_TYPE,
                    source_priority=DERIVED_PRIORITY,
                )
            )
    return out
