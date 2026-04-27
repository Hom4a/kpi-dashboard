"""Golden fixture test for «<Year> рік.xlsx» (format A, wide by month).

Golden assertions run against the **canonical view** of parsed facts, so the
expected annual YTD value comes from the accounting_ytd column (higher
priority) — NOT the sum of monthly operational rows.

Note: no ``ytd_sum_consistency_for_flow`` test here. YTD ≠ sum(monthly) is
normal per finance-dept rule 4 (reversals); canonical view handles it.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from etl.canonical import (
    canonical_annual,
    canonical_monthly,
    canonical_species_annual,
    canonical_species_monthly,
)
from etl.models import ParseResult
from etl.parser_annual_monthly import parse_annual_monthly

XLSX = Path("raw_data/2025_рік.xlsx")
GOLDEN = Path("tests/golden/year_2025.yml")


# ---------------------------------------------------------------------------
# Golden loading (module-level for parametrize)
# ---------------------------------------------------------------------------

def _load_golden() -> dict[str, Any]:
    with GOLDEN.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _parse_ym(label: str) -> tuple[int, int]:
    y, m = label.split("-")
    return int(y), int(m)


_golden = _load_golden()


def _gather_monthly_cases() -> list[tuple[str, int, int, Any]]:
    out: list[tuple[str, int, int, Any]] = []
    for metric_code, periods in _golden["monthly"].items():
        for label, expected in periods.items():
            year, month = _parse_ym(label)
            out.append((metric_code, year, month, expected))
    return out


def _gather_annual_cases() -> list[tuple[str, Any]]:
    return list(_golden["annual_ytd"].items())


def _gather_species_monthly_cases() -> list[tuple[str, int, int, str, Any]]:
    out: list[tuple[str, int, int, str, Any]] = []
    for species_code, periods in _golden["species_monthly"].items():
        for label, pair in periods.items():
            year, month = _parse_ym(label)
            for subfield in ("volume_km3", "avg_price_grn"):
                out.append(
                    (species_code, year, month, subfield, pair.get(subfield))
                )
    return out


def _gather_species_annual_cases() -> list[tuple[str, str, Any]]:
    out: list[tuple[str, str, Any]] = []
    for species_code, pair in _golden["species_annual"].items():
        for subfield in ("volume_km3", "avg_price_grn"):
            out.append((species_code, subfield, pair.get(subfield)))
    return out


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def parsed() -> ParseResult:
    return parse_annual_monthly(XLSX)


@pytest.fixture(scope="module")
def indexes(parsed: ParseResult) -> tuple[Any, Any, Any, Any]:
    # Build canonical views — same semantics the dashboard will see.
    ann = {(a.metric_code, a.year): a.value for a in canonical_annual(parsed.annual)}
    mon = {
        (m.metric_code, m.year, m.month): m.value
        for m in canonical_monthly(parsed.monthly)
    }
    sp_ann = {
        (s.species, s.year): (s.volume_km3, s.avg_price_grn)
        for s in canonical_species_annual(parsed.species_annual)
    }
    sp_mon = {
        (s.species, s.year, s.month): (s.volume_km3, s.avg_price_grn)
        for s in canonical_species_monthly(parsed.species_monthly)
    }
    return ann, mon, sp_ann, sp_mon


# ---------------------------------------------------------------------------
# Monthly scalar
# ---------------------------------------------------------------------------

_MONTHLY_CASES = _gather_monthly_cases()


@pytest.mark.parametrize(
    "metric_code,year,month,expected",
    _MONTHLY_CASES,
    ids=[f"{c[0]}/{c[1]}-{c[2]:02d}" for c in _MONTHLY_CASES],
)
def test_monthly_matches_golden(
    metric_code: str,
    year: int,
    month: int,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    _, mon, _, _ = indexes
    got = mon.get((metric_code, year, month))
    assert got is not None, (
        f"parser missing monthly {metric_code}/{year}-{month:02d} (expected {expected})"
    )
    assert got == pytest.approx(float(expected), rel=1e-9), (
        f"{metric_code}/{year}-{month:02d}: expected {expected}, got {got}"
    )


# ---------------------------------------------------------------------------
# Annual YTD scalar
# ---------------------------------------------------------------------------

_ANNUAL_CASES = _gather_annual_cases()
_YEAR = _golden["year"]


@pytest.mark.parametrize(
    "metric_code,expected",
    _ANNUAL_CASES,
    ids=[c[0] for c in _ANNUAL_CASES],
)
def test_annual_ytd_matches_golden(
    metric_code: str,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    ann, _, _, _ = indexes
    got = ann.get((metric_code, _YEAR))
    assert got is not None, f"parser missing annual {metric_code}/{_YEAR}"
    assert got == pytest.approx(float(expected), rel=1e-9), (
        f"{metric_code}/{_YEAR}: expected {expected}, got {got}"
    )


# ---------------------------------------------------------------------------
# Species
# ---------------------------------------------------------------------------

_SPECIES_MONTHLY = _gather_species_monthly_cases()
_SPECIES_ANNUAL = _gather_species_annual_cases()


@pytest.mark.parametrize(
    "species_code,year,month,subfield,expected",
    _SPECIES_MONTHLY,
    ids=[f"{c[0]}.{c[3]}/{c[1]}-{c[2]:02d}" for c in _SPECIES_MONTHLY],
)
def test_species_monthly_matches_golden(
    species_code: str,
    year: int,
    month: int,
    subfield: str,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    _, _, _, sp_mon = indexes
    pair = sp_mon.get((species_code, year, month))
    assert pair is not None, f"parser missing species {species_code}/{year}-{month:02d}"
    got = pair[0] if subfield == "volume_km3" else pair[1]
    assert got is not None, f"parser got None for {species_code}.{subfield}"
    assert got == pytest.approx(float(expected), rel=1e-9), (
        f"{species_code}.{subfield}/{year}-{month:02d}: expected {expected}, got {got}"
    )


@pytest.mark.parametrize(
    "species_code,subfield,expected",
    _SPECIES_ANNUAL,
    ids=[f"{c[0]}.{c[1]}" for c in _SPECIES_ANNUAL],
)
def test_species_annual_matches_golden(
    species_code: str,
    subfield: str,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    _, _, sp_ann, _ = indexes
    pair = sp_ann.get((species_code, _YEAR))
    assert pair is not None, f"parser missing species annual {species_code}/{_YEAR}"
    got = pair[0] if subfield == "volume_km3" else pair[1]
    assert got is not None, f"parser got None for {species_code}.{subfield}"
    assert got == pytest.approx(float(expected), rel=1e-9), (
        f"{species_code}.{subfield}: expected {expected}, got {got}"
    )


# ---------------------------------------------------------------------------
# Reference («Довідково») rows — substring assertion (year-file → month=0)
# ---------------------------------------------------------------------------

def _gather_reference_cases() -> list[tuple[str, int, str]]:
    items = _golden.get("reference", [])
    return [(it["category"], it["month"], it["content_contains"]) for it in items]


_REFERENCE_CASES = _gather_reference_cases()


@pytest.mark.parametrize(
    "category,month,content_contains",
    _REFERENCE_CASES,
    ids=[f"{c[0]}/m{c[1]}" for c in _REFERENCE_CASES],
)
def test_reference_matches_golden(
    category: str,
    month: int,
    content_contains: str,
    parsed: ParseResult,
) -> None:
    """Each reference golden entry must surface as a ParseResult.reference
    row whose ``content`` contains the expected substring."""
    match = next(
        (
            r for r in parsed.reference
            if r.category == category and r.month == month
        ),
        None,
    )
    assert match is not None, (
        f"parser missing reference fact for {category}/m{month}"
    )
    assert content_contains in match.content, (
        f"content for {category}/m{month} does not contain "
        f"{content_contains!r}; got {match.content!r}"
    )


# ---------------------------------------------------------------------------
# Health invariants
# ---------------------------------------------------------------------------

def test_no_errors(parsed: ParseResult) -> None:
    assert parsed.errors == [], f"parser reported errors: {parsed.errors}"


def test_no_unparseable(parsed: ParseResult) -> None:
    bad = [w for w in parsed.warnings if "unparseable" in w]
    assert bad == [], f"parser had unparseable warnings: {bad}"
