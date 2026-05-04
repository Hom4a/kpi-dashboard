"""Canonical data models returned by parsers.

Each fact row carries revision metadata:
  - ``vintage_date``     — when the number was "frozen" in its source document
  - ``report_type``      — the authoritative kind (operational/accounting_ytd/…)
  - ``source_priority``  — higher wins when multiple sources report the same fact

Business rule: a finance operation cycle closes around the 10th of the next
month; later reports routinely revise earlier figures (reversals, corrections).
Canonical views resolve these into a single "winning" value per metric+period.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportType = Literal[
    "operational",
    "accounting_ytd",
    "official_annual",
    "audit",
    "interim",
]


class AnnualValue(BaseModel):
    """Annual or YTD scalar value for a metric (one year, one column).

    A fact may carry numeric, textual, or both forms — text values arise from
    pending markers ("до 18.04.2026"), narrative cells, and similar non-numeric
    annotations that the source treats as a deliberate value, not missing data.
    """

    metric_code: str
    year: int
    value: float | None = None
    value_text: str | None = None
    is_ytd: bool = False
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class MonthlyValue(BaseModel):
    """Monthly scalar value for a metric (year + month)."""

    metric_code: str
    year: int
    month: int = Field(ge=1, le=12)
    value: float | None = None
    value_text: str | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class SpeciesAnnual(BaseModel):
    """Annual composite (volume/price) for a timber species."""

    species: str
    year: int
    volume_km3: float | None = None
    avg_price_grn: float | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class SpeciesMonthly(BaseModel):
    """Monthly composite (volume/price) for a timber species."""

    species: str
    year: int
    month: int = Field(ge=1, le=12)
    volume_km3: float | None = None
    avg_price_grn: float | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class ReferenceText(BaseModel):
    """Довідково — text-only contextual reference data.

    Each row is one free-text fact about a stable category — minimum wage,
    fuel price, food price, energy tariff, etc. The numeric value (when
    one exists) is embedded in ``content``; we never split it out — the
    source treats the whole sentence as the value.

    ``month`` uses 0 to mean "annual snapshot" (yearly Excel files dump
    one row per category for the whole year), and 1..12 for monthly
    snapshots (osnovni-style files attach Довідково to the current
    month).
    """

    category: str
    year: int
    month: int = Field(ge=0, le=12)
    content: str
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class SalaryValue(BaseModel):
    """Salary fact for one branch (forestry office, central office, center).

    Each row is a single salary observation tied to a branch + period.
    The branch is identified by its **verbatim Excel name** — repository
    layer maps it to a stable ``salary_branches.code`` via the alias
    table; the parser deliberately keeps source text intact so cell
    quotes (``Філія "Карпатський лісовий офіс"``) and whitespace can
    be inspected for ETL audit.

    ``month`` follows ReferenceText semantics:

      * ``0``       — annual average (yearly Excel C14; osnovni C2-C6 —
                       each year column is itself a per-year average).
      * ``1..12``   — monthly snapshot from the corresponding column.

    YTD column (13) is not used: salary spreadsheets do not produce a
    separate YTD figure — the average is the year-level value.

    Two numeric columns are tracked side-by-side because the source
    workbooks pair them in one row:

      * ``salary_uah``      — paid average for the branch.
      * ``region_avg_uah``  — comparator (state-published regional
                              average for the same period); may be
                              absent in older formats.
    """

    branch_name: str
    year: int
    month: int = Field(ge=0, le=12)
    salary_uah: float | None = None
    region_avg_uah: float | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class ParseResult(BaseModel):
    """Output of any parser: typed rows + diagnostics."""

    annual: list[AnnualValue] = Field(default_factory=list)
    monthly: list[MonthlyValue] = Field(default_factory=list)
    species_annual: list[SpeciesAnnual] = Field(default_factory=list)
    species_monthly: list[SpeciesMonthly] = Field(default_factory=list)
    reference: list[ReferenceText] = Field(default_factory=list)
    salary: list[SalaryValue] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
